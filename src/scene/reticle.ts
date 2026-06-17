import * as THREE from 'three';

/** Flat ring reticle that visualizes the current hit-test pose. */
export function createReticle(): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x4f8cff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.renderOrder = 999;
  return mesh;
}
