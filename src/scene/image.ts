import * as THREE from 'three';
import { createCandle, CANDLE_HEIGHT } from './candle';

export interface ImageCandle {
  root: THREE.Group;
  /**
   * Position + scale + style the image candle relative to a lens whose center is at `lensCenter`
   * and whose optical axis points along `axis` (unit vector pointing toward the wall = far side).
   * `v` is the signed image distance (positive = real, far side; negative = virtual, near side).
   * `m` is the signed magnification.
   */
  update(lensCenter: THREE.Vector3, axis: THREE.Vector3, v: number, m: number, real: boolean): void;
  setVisible(v: boolean): void;
}

/**
 * The image is rendered as a candle that gets positioned along the optical axis at distance |v|
 * on the appropriate side of the lens. Inverted (real) images are flipped 180° around the axis
 * perpendicular to the optical axis; virtual images are translucent.
 */
export function createImageCandle(): ImageCandle {
  const root = new THREE.Group();
  const candle = createCandle({ translucent: false });
  root.add(candle);
  root.visible = false;

  // Scale pivot adjustment: candle origin is at base, but for inversion we want the pivot at base
  // for upright and at flame-tip for inverted. We'll handle this via translation in update().

  let cachedReal = true;
  // Cache materials so we can swap opacity efficiently for real vs virtual.
  const allMaterials: THREE.Material[] = [];
  candle.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((mm) => allMaterials.push(mm));
      else allMaterials.push(m);
    }
  });

  function applyOpacityForKind(real: boolean): void {
    const targetOpacity = real ? 1 : 0.45;
    for (const m of allMaterials) {
      m.transparent = !real;
      // Only dim materials whose original opacity was opaque (1).
      const std = m as THREE.MeshStandardMaterial;
      if (std.opacity > 0.85 || real) {
        std.opacity = targetOpacity;
      }
    }
  }

  return {
    root,
    update(lensCenter, axis, v, m, real) {
      // Compute the candle's base position. Real images sit on the far side of the lens.
      const sign = real ? 1 : -1;
      const dist = Math.abs(v);
      const pos = new THREE.Vector3().copy(lensCenter).add(new THREE.Vector3().copy(axis).multiplyScalar(sign * dist));

      // Hide if too far away or NaN.
      if (!isFinite(dist) || dist > 5) {
        root.visible = false;
        return;
      }
      root.visible = true;

      // Magnification → uniform scale (clamped for visual sanity).
      const scale = Math.min(4, Math.max(0.1, Math.abs(m)));
      // For inverted candles the pivot point should be the flame tip so the candle hangs upside down
      // from the optical axis. We achieve this with a child wrapper offset.
      candle.scale.setScalar(scale);

      const inverted = real; // real image inverted, virtual image upright
      if (inverted) {
        // Flip around an axis horizontal & perpendicular to optical axis.
        // Build an "up" basis: world Y is fine since the optical axis is horizontal.
        // Position the candle BASE at the optical axis point but rotated 180° around the
        // horizontal-perpendicular axis. After 180° flip, the candle hangs upside-down with its
        // flame tip touching the original base position. We offset upward so the FLAME TIP sits at
        // the optical axis point (i.e. at the height of the wall center).
        candle.rotation.set(Math.PI, 0, 0);
        // After flipping, candle now extends downward from y=0 to y=-CANDLE_HEIGHT*scale.
        // We want the flame tip (originally at y = +CANDLE_HEIGHT) to land at the optical-axis point.
        // The flipped candle's base (origin) is now at y=0; flame tip is at y=-CANDLE_HEIGHT*scale.
        // So if root sits at the axis point, the flame tip is below it. Offset root upward by
        // CANDLE_HEIGHT*scale so the flame tip aligns with the axis point.
        root.position.copy(pos).add(new THREE.Vector3(0, CANDLE_HEIGHT * scale, 0));
      } else {
        candle.rotation.set(0, 0, 0);
        // Upright: align the candle base with axis level (optical axis runs through the center of
        // the candle vertically; we treat axis level as the candle's mid-flame height for parity
        // with the inverted case).
        root.position.copy(pos).sub(new THREE.Vector3(0, CANDLE_HEIGHT * scale * 0.5, 0));
      }

      if (cachedReal !== real) {
        applyOpacityForKind(real);
        cachedReal = real;
      }
    },
    setVisible(v) {
      root.visible = v;
    },
  };
}
