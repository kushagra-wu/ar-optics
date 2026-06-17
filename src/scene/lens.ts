import * as THREE from 'three';

const LENS_RADIUS = 0.18;       // 18 cm visual radius
const LENS_THICKNESS = 0.04;    // 4 cm at the center for convex / at the edge for concave
const SEGMENTS = 48;

export interface Lens {
  /** Group placed at the lens center. Local +Z is the optical axis pointing toward the wall. */
  root: THREE.Group;
  /** World position of the lens center. */
  position: THREE.Vector3;
  /** World-space optical axis direction (unit vector toward the wall). */
  axis: THREE.Vector3;
  /** Toggle convex/concave geometry. */
  setType(type: 'convex' | 'concave'): void;
}

export function createLens(): Lens {
  const root = new THREE.Group();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x9ec5ff,
    transparent: true,
    opacity: 0.55,
    transmission: 0.35,
    roughness: 0.08,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  let mesh: THREE.Mesh = buildConvexMesh(material);
  root.add(mesh);

  // Faint outline ring so the lens is visible against busy backgrounds.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc7d4ff, transparent: true, opacity: 0.95 });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(LENS_RADIUS, 0.004, 8, SEGMENTS),
    ringMat,
  );
  ring.rotation.x = Math.PI / 2; // ring lies in the lens plane (XY)
  root.add(ring);

  root.visible = false;

  const lens: Lens = {
    root,
    position: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 0, 1),
    setType(type) {
      const isConvex = type === 'convex';
      // Replace mesh geometry only; material persists.
      const next = isConvex ? buildConvexMesh(material) : buildConcaveMesh(material);
      root.remove(mesh);
      mesh.geometry.dispose();
      mesh = next;
      root.add(mesh);
    },
  };
  return lens;
}

/**
 * Place the lens in the world so its optical axis points from the lens position toward `wallCenter`,
 * height-locked to the viewer's eye-height at placement (passed in `worldPosition.y`).
 */
export function placeLens(
  lens: Lens,
  worldPosition: THREE.Vector3,
  wallCenter: THREE.Vector3,
): void {
  lens.position.copy(worldPosition);
  lens.root.position.copy(worldPosition);

  // Optical axis = horizontal direction from lens toward wall (we've already locked Y at placement).
  const toWall = new THREE.Vector3().subVectors(wallCenter, worldPosition);
  toWall.y = 0;
  if (toWall.lengthSq() < 1e-4) toWall.set(0, 0, -1);
  toWall.normalize();
  lens.axis.copy(toWall);

  // Orient root so local +Z = optical axis.
  const target = new THREE.Vector3().copy(worldPosition).add(toWall);
  lens.root.up.set(0, 1, 0);
  lens.root.lookAt(target);
  lens.root.visible = true;
}

function buildConvexMesh(material: THREE.Material): THREE.Mesh {
  // Profile in the XY plane: half-cross-section of a biconvex lens, revolved around X axis later.
  // We use LatheGeometry which revolves around Y, so build the profile in the XY plane and rotate.
  const points: THREE.Vector2[] = [];
  const half = LENS_THICKNESS / 2;
  const r = LENS_RADIUS;
  // Spherical cap profile: y = sqrt(R^2 - x^2) - (R - half) within x ∈ [0, r], where R chosen so y(r)=0.
  const R = (r * r + half * half) / (2 * half);
  const offset = R - half;
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    const x = (i / STEPS) * r;
    const y = Math.sqrt(R * R - x * x) - offset;
    points.push(new THREE.Vector2(x, Math.max(0, y)));
  }
  const lathe = new THREE.LatheGeometry(points, SEGMENTS);
  // LatheGeometry revolves around Y. We want the lens disc lying in XY plane (axis = Z).
  lathe.rotateX(Math.PI / 2);
  // Mirror to get the back half.
  const back = lathe.clone();
  back.scale(1, 1, -1);
  const merged = mergeGeometries([lathe, back]);
  return new THREE.Mesh(merged, material);
}

function buildConcaveMesh(material: THREE.Material): THREE.Mesh {
  // Biconcave: thicker at the rim, thinner at the center. Profile inverts.
  const points: THREE.Vector2[] = [];
  const halfRim = LENS_THICKNESS / 2;
  const halfCenter = halfRim * 0.25; // center is 25% of rim thickness
  const r = LENS_RADIUS;
  const STEPS = 24;
  // Profile: y goes from halfCenter at x=0 to halfRim at x=r, smooth curve.
  for (let i = 0; i <= STEPS; i++) {
    const x = (i / STEPS) * r;
    const t = x / r;
    // Quadratic ease so it bulges outward at the rim.
    const y = halfCenter + (halfRim - halfCenter) * (t * t);
    points.push(new THREE.Vector2(x, y));
  }
  const lathe = new THREE.LatheGeometry(points, SEGMENTS);
  lathe.rotateX(Math.PI / 2);
  const back = lathe.clone();
  back.scale(1, 1, -1);
  const merged = mergeGeometries([lathe, back]);
  return new THREE.Mesh(merged, material);
}

/** Minimal geometry merge (positions only) sufficient for our two halves. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  for (const g of geos) totalVerts += (g.attributes.position as THREE.BufferAttribute).count;

  const merged = new THREE.BufferGeometry();
  const positions = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of geos) {
    const arr = (g.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>;
    positions.set(arr, offset);
    offset += arr.length;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}
