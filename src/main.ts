import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

import { getState, setState, subscribe } from './ui/state';
import { initOverlay } from './ui/overlay';
import { HitTester } from './xr/hitTest';
import { createReticle } from './scene/reticle';
import { createWall, placeWall } from './scene/wall';
import { createLens, placeLens } from './scene/lens';
import { createCandle, CANDLE_HEIGHT } from './scene/candle';
import { createImageCandle } from './scene/image';
import { createRayDiagram } from './scene/rays';
import { createAxisHint } from './scene/axisHint';
import { imageProperties } from './physics/lens';

// ---------- Scene ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1);
scene.add(dir);

// ---------- Scene objects ----------
const reticle = createReticle();
scene.add(reticle);

const { wall, obj: wallObj } = createWall();
scene.add(wallObj);

const lens = createLens();
scene.add(lens.root);

const objectCandle = createCandle({ translucent: false });
objectCandle.visible = false;
scene.add(objectCandle);

const imageCandle = createImageCandle();
scene.add(imageCandle.root);

const rayDiagram = createRayDiagram();
scene.add(rayDiagram.group);

const axisHint = createAxisHint();
scene.add(axisHint.group);

// ---------- XR helpers ----------
const hitTester = new HitTester();
let xrRefSpace: XRReferenceSpace | null = null;

// Overlay
const overlay = initOverlay({
  onPrimaryAction: () => {
    const s = getState();
    if (s.phase === 'aiming') doSnap();
    else if (s.phase === 'snapped') doResume();
  },
  onLensTypeChange: (type) => {
    setState({ lensType: type });
    lens.setType(type);
  },
});

// React to lens-type changes (also fires when init populates state).
subscribe((s) => {
  if (s.phase === 'aiming') {
    // Trigger image recompute next frame; the loop already does this.
  }
});

// ---------- Session lifecycle ----------
renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession();
  if (!session) return;
  overlay.show();
  overlay.setStatus('Tap a wall to place the screen');

  try {
    xrRefSpace = await session.requestReferenceSpace('local');
  } catch (err) {
    console.error('[xr] failed to acquire local reference space', err);
    return;
  }
  await hitTester.start(session);

  setState({ phase: 'place-wall', fAbs: 0, props: null });
  // Reset scene visuals.
  wall.root.visible = false;
  lens.root.visible = false;
  objectCandle.visible = false;
  imageCandle.setVisible(false);
  rayDiagram.setVisible(false);
  axisHint.setVisible(false);
  reticle.visible = false;
});

renderer.xr.addEventListener('sessionend', () => {
  overlay.hide();
  hitTester.stop();
  xrRefSpace = null;
  setState({ phase: 'place-wall', fAbs: 0, props: null });
});

// ---------- Tap to place ----------
const controller = renderer.xr.getController(0);
scene.add(controller);
controller.addEventListener('select', () => {
  const s = getState();
  if (!reticle.visible) return;

  // Extract reticle world position from its matrix.
  const pos = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _scl = new THREE.Vector3();
  reticle.matrix.decompose(pos, _q, _scl);

  if (s.phase === 'place-wall') {
    placeWallAt(pos);
  } else if (s.phase === 'place-lens') {
    placeLensAt(pos);
  }
});

function placeWallAt(worldPos: THREE.Vector3): void {
  // Use camera position as viewer anchor for orientation.
  const viewer = getViewerWorldPos();
  // Wall center is at the tapped point but height-locked to viewer eye height so the wall is
  // a realistic vertical surface in front of the user.
  const wallCenter = new THREE.Vector3(worldPos.x, viewer.y, worldPos.z);
  placeWall(wall, wallCenter, viewer);
  reticle.visible = false;
  setState({ phase: 'place-lens' });
  overlay.setStatus('Now tap to place the lens between you and the wall');
}

function placeLensAt(worldPos: THREE.Vector3): void {
  // Lens height = viewer eye-height at placement time (per spec).
  const viewer = getViewerWorldPos();
  const lensCenter = new THREE.Vector3(worldPos.x, viewer.y, worldPos.z);

  // Sanity: the lens must be in front of the wall (on the viewer's side).
  // Check the signed distance from lens to wall along wall.normal — wall.normal points toward the viewer,
  // so a point on the viewer side has positive signed distance.
  const signed = wall.distanceTo(lensCenter);
  if (signed <= 0.05) {
    overlay.setStatus('Move closer or tap a point in front of the wall');
    return;
  }

  placeLens(lens, lensCenter, wall.position);

  // Focal length = lens-to-wall distance / 2.
  // The orthogonal distance from lens center to wall plane along wall.normal:
  const wallDist = signed; // positive scalar
  const fAbs = Math.max(0.1, Math.min(3, wallDist / 2));

  setState({ phase: 'aiming', fAbs });
  overlay.setStatus('Walk to change object distance · Snap to freeze');
}

function getViewerWorldPos(): THREE.Vector3 {
  // renderer.xr.getCamera() returns an ArrayCamera in XR; its first sub-camera world position is
  // the viewer's eye. In the animation loop we'd use frame.getViewerPose, but for tap handlers
  // we read from the rendered camera which is updated each XR frame.
  const xrCam = renderer.xr.getCamera();
  return xrCam.getWorldPosition(new THREE.Vector3());
}

// ---------- Snap / Resume ----------
function doSnap(): void {
  const s = getState();
  if (s.phase !== 'aiming' || !s.props) return;

  // Freeze object candle at current viewer position projected onto the optical axis.
  const viewer = getViewerWorldPos();
  const projected = projectOntoAxis(viewer, lens.position, lens.axis);
  // Sit the candle on the floor below viewer height — for a clean ray diagram we place its base
  // at the lens height minus half the candle height (so the flame tip is at axis height).
  const candleBase = new THREE.Vector3(projected.x, lens.position.y - CANDLE_HEIGHT / 2, projected.z);
  objectCandle.position.copy(candleBase);
  // Orient candle so it stands upright (default).
  objectCandle.rotation.set(0, 0, 0);
  objectCandle.visible = true;

  // Build ray diagram.
  rebuildRayDiagram();
  rayDiagram.setVisible(true);

  axisHint.setVisible(false);
  setState({ phase: 'snapped' });
  overlay.setStatus('Walk around the diagram · Resume Aim to keep moving', null);
}

function doResume(): void {
  objectCandle.visible = false;
  rayDiagram.setVisible(false);
  setState({ phase: 'aiming' });
  overlay.setStatus('Walk to change object distance · Snap to freeze');
}

function rebuildRayDiagram(): void {
  const s = getState();
  if (!s.props) return;

  // Object tip in world: above objectCandle by CANDLE_HEIGHT.
  const objectTip = new THREE.Vector3().copy(objectCandle.position).add(new THREE.Vector3(0, CANDLE_HEIGHT, 0));
  // Image tip: position at the lens-axis point at distance |v|; for inverted real images the tip
  // is BELOW the axis by an amount proportional to magnification. We approximate this by computing
  // a perpendicular offset = m * (object's height above axis).
  const objectAboveAxis = objectTip.y - lens.position.y;
  const imageBelowAxis = -s.props.m * objectAboveAxis; // m is signed
  const sign = s.props.real ? 1 : -1;
  const imageCenter = new THREE.Vector3()
    .copy(lens.position)
    .add(new THREE.Vector3().copy(lens.axis).multiplyScalar(sign * Math.min(5, Math.abs(s.props.v))));
  const imageTip = new THREE.Vector3().copy(imageCenter).add(new THREE.Vector3(0, imageBelowAxis, 0));

  rayDiagram.update({
    objectTip,
    lensCenter: lens.position,
    axis: lens.axis,
    up: new THREE.Vector3(0, 1, 0),
    fAbs: s.fAbs,
    real: s.props.real,
    imageTip,
  });
}

// ---------- Animation loop ----------
function onXRFrame(_t: number, frame?: XRFrame): void {
  if (frame && xrRefSpace) {
    const s = getState();

    // Hit-test → reticle (only during placement phases).
    if (s.phase === 'place-wall' || s.phase === 'place-lens') {
      const pose = hitTester.getLatestPose(frame, xrRefSpace);
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
        if (!reticle.visible) {
          reticle.visible = true;
          if (s.phase === 'place-wall') overlay.setStatus('Tap to place the screen');
          else overlay.setStatus('Tap to place the lens');
        }
      } else {
        reticle.visible = false;
      }
    } else {
      reticle.visible = false;
    }

    // Aiming → compute live image.
    if (s.phase === 'aiming') {
      const viewerPose = frame.getViewerPose(xrRefSpace);
      if (viewerPose) {
        const viewer = new THREE.Vector3(
          viewerPose.transform.position.x,
          viewerPose.transform.position.y,
          viewerPose.transform.position.z,
        );
        // Object position = viewer position projected onto the optical axis (1D distance).
        const projected = projectOntoAxis(viewer, lens.position, lens.axis);
        // Signed `u`: positive when on the near side (opposite of lens.axis direction).
        const signedDot = new THREE.Vector3().subVectors(projected, lens.position).dot(lens.axis);
        const u = -signedDot; // negative dot → near side → positive u

        if (u <= 0.05) {
          overlay.setStatus("You're behind the lens — step in front", 'warn');
          imageCandle.setVisible(false);
          axisHint.setVisible(false);
          setState({ u: 0, props: null });
        } else {
          // f sign: positive convex, negative concave.
          const f = s.lensType === 'convex' ? s.fAbs : -s.fAbs;
          const props = imageProperties(u, f);
          setState({ u, props });

          // Update image candle visual.
          imageCandle.update(lens.position, lens.axis, props.v, props.m, props.real);

          // Axis hint: from viewer to projected.
          axisHint.setVisible(true);
          axisHint.update(viewer, projected);

          // Status pill tone.
          if (props.atInfinity) overlay.setStatus(props.summary, 'warn');
          else if (props.real) overlay.setStatus(props.summary, 'real');
          else overlay.setStatus(props.summary, 'virtual');
        }
      }
    } else if (s.phase === 'snapped') {
      // Re-render rays each frame in case lens type was toggled while snapped.
      // Recompute v / props from frozen object candle position.
      const objectTipBase = new THREE.Vector3().copy(objectCandle.position);
      const projected = projectOntoAxis(objectTipBase, lens.position, lens.axis);
      const signedDot = new THREE.Vector3().subVectors(projected, lens.position).dot(lens.axis);
      const u = -signedDot;
      if (u > 0.05) {
        const f = s.lensType === 'convex' ? s.fAbs : -s.fAbs;
        const props = imageProperties(u, f);
        if (s.props === null || props.summary !== s.props.summary || props.v !== s.props.v) {
          setState({ u, props });
          imageCandle.update(lens.position, lens.axis, props.v, props.m, props.real);
          rebuildRayDiagram();
        }
      }
      axisHint.setVisible(false);
    } else {
      axisHint.setVisible(false);
      imageCandle.setVisible(false);
    }
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(onXRFrame);

// ---------- Geometry helper ----------
function projectOntoAxis(point: THREE.Vector3, axisOrigin: THREE.Vector3, axisDir: THREE.Vector3): THREE.Vector3 {
  const rel = new THREE.Vector3().subVectors(point, axisOrigin);
  const t = rel.dot(axisDir);
  return new THREE.Vector3().copy(axisOrigin).add(new THREE.Vector3().copy(axisDir).multiplyScalar(t));
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Bootstrap ----------
async function bootstrap(): Promise<void> {
  const splashStatus = document.getElementById('splash-status');
  const slot = document.getElementById('ar-button-slot');
  if (!splashStatus || !slot) return;

  if (!('xr' in navigator) || !navigator.xr) {
    showNoArMessage(splashStatus, 'This browser does not expose the WebXR Device API.');
    return;
  }
  let supported = false;
  try {
    supported = await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    supported = false;
  }
  if (!supported) {
    showNoArMessage(
      splashStatus,
      'WebXR AR is not available on this device or browser. Open in Chrome on an ARCore-supported Android device.',
    );
    return;
  }
  splashStatus.textContent = 'Ready — tap below to start.';

  const overlayRoot = document.getElementById('overlay')!;
  const button = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['local-floor', 'anchors'],
    domOverlay: { root: overlayRoot },
  });
  queueMicrotask(() => {
    button.style.cssText = '';
  });
  slot.appendChild(button);
}

function showNoArMessage(splashStatus: HTMLElement, msg: string): void {
  splashStatus.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'no-ar';
  wrap.innerHTML = `
    <strong>WebXR AR unavailable.</strong>
    <p>${msg}</p>
    <p>See <a href="https://immersiveweb.dev/" target="_blank" rel="noopener">immersiveweb.dev</a> for device support.</p>
  `;
  splashStatus.appendChild(wrap);
}

bootstrap().catch((err) => {
  console.error('[bootstrap]', err);
});
