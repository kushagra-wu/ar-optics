import * as THREE from 'three';

const RAY_RADIUS = 0.004; // 4 mm cylinder radius

/** A single ray segment. Reusable: call `update(start, end)` each frame. */
export class RaySegment {
  readonly mesh: THREE.Mesh;
  private readonly axis = new THREE.Vector3(0, 1, 0);
  constructor(color: number, opts: { dashed?: boolean } = {}) {
    const geo = new THREE.CylinderGeometry(RAY_RADIUS, RAY_RADIUS, 1, 12, 1, true);
    geo.translate(0, 0.5, 0); // origin at one end so we can scale Y to length
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: opts.dashed === true,
      opacity: opts.dashed === true ? 0.45 : 0.95,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
  }

  update(start: THREE.Vector3, end: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-4) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(start);
    // Cylinder default axis is +Y; rotate it to point along `dir`.
    const dirN = dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(this.axis, dirN);
    this.mesh.quaternion.copy(q);
    this.mesh.scale.set(1, len, 1);
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }
}

export interface RayDiagram {
  group: THREE.Group;
  /**
   * Build the 3 principal rays for a thin lens given:
   *  - object point (tip of the candle, world-space)
   *  - lens center (world-space)
   *  - axis (unit vector along optical axis, pointing object → image side)
   *  - up (unit vector "up" in the lens plane, used for the parallel-ray geometry)
   *  - fAbs (focal-length magnitude)
   *  - real (image is real)
   *  - imageTip (world-space image tip)
   */
  update(args: {
    objectTip: THREE.Vector3;
    lensCenter: THREE.Vector3;
    axis: THREE.Vector3;
    up: THREE.Vector3;
    fAbs: number;
    real: boolean;
    imageTip: THREE.Vector3;
  }): void;
  setVisible(v: boolean): void;
}

const COLOR_PARALLEL = 0x34d399;  // teal
const COLOR_CHIEF = 0xfbbf24;     // amber
const COLOR_FOCAL = 0xf472b6;     // magenta-ish

export function createRayDiagram(): RayDiagram {
  const group = new THREE.Group();
  group.visible = false;

  // 5 segments total:
  //   parallel: object → lens (parallel to axis), lens → image side (through far F)
  //   chief:    object → image tip (single straight line through lens center)
  //   focal:    object → near-side F (continued to lens), lens → far side (parallel to axis)
  const parA = new RaySegment(COLOR_PARALLEL);
  const parB = new RaySegment(COLOR_PARALLEL);
  const chief = new RaySegment(COLOR_CHIEF);
  const focA = new RaySegment(COLOR_FOCAL);
  const focB = new RaySegment(COLOR_FOCAL);

  for (const r of [parA, parB, chief, focA, focB]) group.add(r.mesh);

  return {
    group,
    update({ objectTip, lensCenter, axis, fAbs, real, imageTip }) {
      // Project the object tip onto the lens plane (perpendicular component preserved).
      // 1) Parallel ray: from objectTip, go parallel to axis until hitting the lens plane.
      //    On the far side, head from the lens-plane intersection through the far-side F point on
      //    the optical axis. (For convex this converges to image tip; we draw to image tip directly
      //    so it works for both real and virtual.)
      const distAlongAxis = new THREE.Vector3().subVectors(objectTip, lensCenter).dot(axis);
      // The lens plane intersection of the parallel ray:
      const parallelHit = new THREE.Vector3()
        .copy(objectTip)
        .sub(new THREE.Vector3().copy(axis).multiplyScalar(distAlongAxis));
      parA.update(objectTip, parallelHit);

      // From parallelHit go to imageTip — for convex this is the textbook "through far F" line;
      // for concave/virtual, this still terminates at the (virtual) image tip on the near side.
      parB.update(parallelHit, imageTip);

      // 2) Chief ray: straight from object tip through lens center, to image tip.
      chief.update(objectTip, imageTip);

      // 3) Focal ray: object tip → near-side F point on the optical axis → lens plane intersection
      //    → far side parallel to axis.
      const nearF = new THREE.Vector3().copy(lensCenter).sub(new THREE.Vector3().copy(axis).multiplyScalar(fAbs));
      // Find where the line (objectTip → nearF) extended hits the lens plane (perpendicular to axis through lensCenter).
      const focalHit = intersectLineWithPlane(objectTip, nearF, lensCenter, axis);
      if (focalHit) {
        focA.update(objectTip, focalHit);
        // Continue parallel to axis from focalHit toward the image side. Length:
        // make it long enough to reach beyond the image tip (clamped to 5 m).
        const farLen = Math.min(5, Math.abs(distAlongAxis) + Math.abs(fAbs) * 4);
        const farEnd = new THREE.Vector3().copy(focalHit).add(new THREE.Vector3().copy(axis).multiplyScalar(farLen));
        focB.update(focalHit, farEnd);
      } else {
        focA.setVisible(false);
        focB.setVisible(false);
      }

      // Quick visual flag: if image is virtual, dim the parallel-side B segment slightly so it
      // reads as the "extension" line.
      (parB.mesh.material as THREE.MeshBasicMaterial).opacity = real ? 0.95 : 0.5;
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

/** Returns the intersection of line (a → b) extended with the plane defined by point + normal, or null if parallel. */
function intersectLineWithPlane(
  a: THREE.Vector3,
  b: THREE.Vector3,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): THREE.Vector3 | null {
  const dir = new THREE.Vector3().subVectors(b, a);
  const denom = dir.dot(planeNormal);
  if (Math.abs(denom) < 1e-6) return null;
  const t = new THREE.Vector3().subVectors(planePoint, a).dot(planeNormal) / denom;
  return new THREE.Vector3().copy(a).add(dir.multiplyScalar(t));
}
