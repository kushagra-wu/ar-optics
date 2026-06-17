/**
 * Thin-lens optics: pure functions only, no DOM, no Three.js.
 *
 * Sign convention (object on the +u side of the lens):
 *   u > 0  → object distance (always positive, measured from lens to object).
 *   f > 0  → convex (converging) lens.
 *   f < 0  → concave (diverging) lens.
 *   v > 0  → real image, opposite side from object.
 *   v < 0  → virtual image, same side as object.
 *
 * Thin-lens equation:
 *   1/v = 1/f - 1/u   →   v = (u * f) / (u - f)
 */

export type ObjectRegion =
  | 'origin'
  | 'between-origin-and-F'
  | 'at-F'
  | 'between-F-and-2F'
  | 'at-2F'
  | 'beyond-2F'
  | 'at-infinity';

export type ImageRegion =
  | 'between-origin-and-F'
  | 'at-F'
  | 'between-F-and-2F'
  | 'at-2F'
  | 'beyond-2F'
  | 'at-infinity'
  | 'virtual-near-side';

export interface ImageProperties {
  /** True if image is real (on the far side of lens). */
  real: boolean;
  /** True if image is inverted relative to the object. */
  inverted: boolean;
  /** True if |magnification| > 1. */
  magnified: boolean;
  /** True if object essentially at the focal plane → image at infinity. */
  atInfinity: boolean;
  /** Signed image distance v in meters (positive = real / far side, negative = virtual / near side). */
  v: number;
  /** Signed magnification m = -v/u. Negative = inverted real image; positive = upright virtual. */
  m: number;
  /** Region label for the object position. */
  objectRegion: ObjectRegion;
  /** Region label for the image position. */
  imageRegion: ImageRegion;
  /** Human-readable summary like "Real · Inverted · Magnified". */
  summary: string;
}

const TOL = 0.04; // 4 cm tolerance for "at F" / "at 2F" / "at origin" classifications

/** Returns the signed image distance v. Returns Infinity (signed) when object is at the focal plane. */
export function imageDistance(u: number, f: number): number {
  if (Math.abs(u - f) < 1e-3) return f > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return (u * f) / (u - f);
}

/** Lateral magnification m = -v/u (signed). */
export function magnification(u: number, v: number): number {
  if (u === 0) return 0;
  if (!isFinite(v)) return v < 0 ? -Infinity : Infinity;
  return -v / u;
}

/** Classify object position relative to F and 2F (with tolerance). */
export function classifyObject(u: number, fAbs: number): ObjectRegion {
  if (u < TOL) return 'origin';
  if (Math.abs(u - fAbs) < TOL) return 'at-F';
  if (Math.abs(u - 2 * fAbs) < TOL) return 'at-2F';
  if (u > 50 * fAbs) return 'at-infinity';
  if (u < fAbs) return 'between-origin-and-F';
  if (u < 2 * fAbs) return 'between-F-and-2F';
  return 'beyond-2F';
}

/** Classify image position. For virtual images returns 'virtual-near-side'. */
export function classifyImage(v: number, f: number): ImageRegion {
  if (!isFinite(v)) return 'at-infinity';
  if (f < 0) return 'virtual-near-side'; // concave always
  if (v < 0) return 'virtual-near-side';
  const fAbs = Math.abs(f);
  if (Math.abs(v - fAbs) < TOL) return 'at-F';
  if (Math.abs(v - 2 * fAbs) < TOL) return 'at-2F';
  if (v > 50 * fAbs) return 'at-infinity';
  if (v < fAbs) return 'between-origin-and-F';
  if (v < 2 * fAbs) return 'between-F-and-2F';
  return 'beyond-2F';
}

/**
 * Compute everything in one shot. `f` is signed: positive convex, negative concave.
 * `u` should be positive (caller guards against u <= 0 before calling).
 */
export function imageProperties(u: number, f: number): ImageProperties {
  const v = imageDistance(u, f);
  const m = magnification(u, v);
  const atInfinity = !isFinite(v);
  const real = isFinite(v) && v > 0;
  const inverted = real; // for thin lens with object on near side, real image is inverted
  const magnified = Math.abs(m) > 1 + 1e-3;
  const fAbs = Math.abs(f);
  const objectRegion = classifyObject(u, fAbs);
  const imageRegion = classifyImage(v, f);

  const parts: string[] = [];
  if (atInfinity) {
    parts.push('Image at infinity');
  } else {
    parts.push(real ? 'Real' : 'Virtual');
    parts.push(inverted ? 'Inverted' : 'Upright');
    if (Math.abs(Math.abs(m) - 1) < 0.05) parts.push('Same Size');
    else if (magnified) parts.push('Magnified');
    else parts.push('Diminished');
  }

  return {
    real,
    inverted,
    magnified,
    atInfinity,
    v,
    m,
    objectRegion,
    imageRegion,
    summary: parts.join(' · '),
  };
}

/** Pretty label for region enums. */
export function labelForRegion(r: ObjectRegion | ImageRegion): string {
  switch (r) {
    case 'origin':
      return 'at lens (origin)';
    case 'between-origin-and-F':
      return 'between lens and F';
    case 'at-F':
      return 'at F';
    case 'between-F-and-2F':
      return 'between F and 2F';
    case 'at-2F':
      return 'at 2F';
    case 'beyond-2F':
      return 'beyond 2F';
    case 'at-infinity':
      return 'at infinity';
    case 'virtual-near-side':
      return 'virtual (near side)';
  }
}
