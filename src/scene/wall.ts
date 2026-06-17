import * as THREE from 'three';

const WALL_W = 4;
const WALL_H = 3;

export interface Wall {
  /** Group at the wall's center; local +Z points away from the user (into the wall normal). */
  root: THREE.Group;
  /** Plane normal in world coordinates (the +Z direction of root). */
  normal: THREE.Vector3;
  /** World-space position of the wall center. */
  position: THREE.Vector3;
  /** Convenience: signed distance from world point to wall plane along the normal. */
  distanceTo(point: THREE.Vector3): number;
}

/** Translucent screen plane with a faint grid. Always faces the user at placement time. */
export function createWall(): { wall: Wall; obj: THREE.Object3D } {
  const root = new THREE.Group();

  // Translucent panel
  const panelGeo = new THREE.PlaneGeometry(WALL_W, WALL_H);
  const panelMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  root.add(panel);

  // Border
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(panelGeo),
    new THREE.LineBasicMaterial({ color: 0x9bb6ff, transparent: true, opacity: 0.8 }),
  );
  root.add(border);

  // Faint grid
  const lines = buildGrid(WALL_W, WALL_H, 0.5);
  const grid = new THREE.LineSegments(
    lines,
    new THREE.LineBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.25 }),
  );
  root.add(grid);

  root.visible = false;

  const wallObj: Wall = {
    root,
    normal: new THREE.Vector3(0, 0, 1),
    position: new THREE.Vector3(),
    distanceTo(point) {
      const d = new THREE.Vector3().subVectors(point, this.position);
      return d.dot(this.normal);
    },
  };

  return { wall: wallObj, obj: root };
}

/**
 * Position the wall and orient it so its +Z axis points back toward the viewer, with up
 * locked to world Y. Updates the wall's position + normal helpers.
 */
export function placeWall(
  wall: Wall,
  worldPosition: THREE.Vector3,
  viewerPosition: THREE.Vector3,
): void {
  // Direction from wall to viewer, projected to horizontal plane (so wall stays vertical).
  const toViewer = new THREE.Vector3().subVectors(viewerPosition, worldPosition);
  toViewer.y = 0;
  if (toViewer.lengthSq() < 1e-4) toViewer.set(0, 0, 1);
  toViewer.normalize();

  wall.position.copy(worldPosition);
  wall.root.position.copy(worldPosition);
  // Look at a point in front of the wall along the viewer direction.
  const lookTarget = new THREE.Vector3().copy(worldPosition).add(toViewer);
  wall.root.up.set(0, 1, 0);
  wall.root.lookAt(lookTarget);
  wall.root.visible = true;

  // Wall's local +Z is the surface normal pointing toward the viewer.
  wall.normal.copy(toViewer);
}

function buildGrid(width: number, height: number, spacing: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const halfW = width / 2;
  const halfH = height / 2;
  for (let x = -halfW; x <= halfW + 1e-6; x += spacing) {
    positions.push(x, -halfH, 0, x, halfH, 0);
  }
  for (let y = -halfH; y <= halfH + 1e-6; y += spacing) {
    positions.push(-halfW, y, 0, halfW, y, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}
