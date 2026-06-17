import * as THREE from 'three';

/**
 * Faint dotted poly-line drawn from the user's actual world position to its projection on the
 * optical axis. Helps the user see how stepping sideways doesn't change `u`.
 */
export interface AxisHint {
  group: THREE.Group;
  /** Update the visual to reflect a new user position and projected point. */
  update(userPos: THREE.Vector3, projectedPos: THREE.Vector3): void;
  setVisible(v: boolean): void;
}

const DOT_COUNT = 16;
const DOT_RADIUS = 0.006;

export function createAxisHint(): AxisHint {
  const group = new THREE.Group();
  group.visible = false;

  const geo = new THREE.SphereGeometry(DOT_RADIUS, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xc7d4ff, transparent: true, opacity: 0.55 });
  const dots = new THREE.InstancedMesh(geo, mat, DOT_COUNT);
  dots.frustumCulled = false;
  dots.count = 0;
  group.add(dots);

  const dummy = new THREE.Object3D();

  return {
    group,
    update(userPos, projectedPos) {
      const dir = new THREE.Vector3().subVectors(projectedPos, userPos);
      const len = dir.length();
      if (len < 0.05) {
        dots.count = 0;
        dots.instanceMatrix.needsUpdate = true;
        return;
      }
      const n = Math.min(DOT_COUNT, Math.max(2, Math.floor(len / 0.06) + 1));
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        dummy.position.copy(userPos).add(dir.clone().multiplyScalar(t));
        dummy.updateMatrix();
        dots.setMatrixAt(i, dummy.matrix);
      }
      dots.count = n;
      dots.instanceMatrix.needsUpdate = true;
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}
