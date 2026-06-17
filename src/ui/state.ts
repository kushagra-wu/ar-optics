import type { ImageProperties } from '../physics/lens';

export type Phase = 'place-wall' | 'place-lens' | 'aiming' | 'snapped';
export type LensType = 'convex' | 'concave';

export interface AppState {
  /** Current interaction phase. */
  phase: Phase;
  /** Active lens type. */
  lensType: LensType;
  /** Focal length magnitude in meters (set when lens is placed = wall-to-lens distance / 2). */
  fAbs: number;
  /** Last computed object distance u in meters (positive on the near side of the lens). */
  u: number;
  /** Last computed image properties, or null when not aiming. */
  props: ImageProperties | null;
  /** Whether overlay should be visible (true during XR session). */
  overlayShown: boolean;
}

type Listener = (s: Readonly<AppState>) => void;

const state: AppState = {
  phase: 'place-wall',
  lensType: 'convex',
  fAbs: 0,
  u: 0,
  props: null,
  overlayShown: false,
};

const listeners = new Set<Listener>();

export function getState(): Readonly<AppState> {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  let changed = false;
  for (const k of Object.keys(patch) as (keyof AppState)[]) {
    const next = patch[k];
    if (next !== undefined && state[k] !== next) {
      (state as Record<keyof AppState, AppState[keyof AppState]>)[k] = next as AppState[keyof AppState];
      changed = true;
    }
  }
  if (changed) for (const l of listeners) l(state);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
