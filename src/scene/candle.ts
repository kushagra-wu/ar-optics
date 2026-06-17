import * as THREE from 'three';

const BODY_HEIGHT = 0.16;     // 16 cm candle body
const BODY_RADIUS = 0.018;    // 1.8 cm radius
const FLAME_HEIGHT = 0.05;
const FLAME_WIDTH = 0.018;

/**
 * Builds a candle group (body + flame). Returned object's local origin is at the BASE of the candle,
 * so callers can drop it on a surface or pivot it around the base.
 */
export function createCandle(opts: { translucent?: boolean } = {}): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    roughness: 0.7,
    metalness: 0,
    transparent: opts.translucent === true,
    opacity: opts.translucent === true ? 0.5 : 1,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, BODY_HEIGHT, 16),
    bodyMat,
  );
  body.position.y = BODY_HEIGHT / 2;
  group.add(body);

  const wickMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 8), wickMat);
  wick.position.y = BODY_HEIGHT + 0.01;
  group.add(wick);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffae3c,
    transparent: true,
    opacity: opts.translucent === true ? 0.55 : 0.95,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(FLAME_WIDTH, FLAME_HEIGHT, 12),
    flameMat,
  );
  flame.position.y = BODY_HEIGHT + 0.02 + FLAME_HEIGHT / 2;
  group.add(flame);

  // Inner brighter core
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff7ad,
    transparent: true,
    opacity: opts.translucent === true ? 0.55 : 0.9,
    depthWrite: false,
  });
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(FLAME_WIDTH * 0.55, FLAME_HEIGHT * 0.7, 12),
    coreMat,
  );
  core.position.y = BODY_HEIGHT + 0.02 + (FLAME_HEIGHT * 0.7) / 2;
  group.add(core);

  return group;
}

/** Total candle height (base to flame tip) used by callers for inversion math. */
export const CANDLE_HEIGHT = BODY_HEIGHT + 0.02 + FLAME_HEIGHT;
