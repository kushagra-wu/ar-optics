import { getState, setState, subscribe } from './state';
import { labelForRegion } from '../physics/lens';
import type { LensType } from './state';

export interface OverlayHandlers {
  onPrimaryAction: () => void;
  onLensTypeChange: (t: LensType) => void;
}

export interface OverlayApi {
  setStatus(text: string, tone?: 'real' | 'virtual' | 'warn' | null): void;
  show(): void;
  hide(): void;
}

export function initOverlay(handlers: OverlayHandlers): OverlayApi {
  const overlay = requireEl<HTMLDivElement>('overlay');
  const statusPill = requireEl<HTMLDivElement>('status-pill');
  const topCard = requireEl<HTMLDivElement>('top-card');
  const propsLine = requireEl<HTMLDivElement>('props-line');
  const bottomStack = requireEl<HTMLDivElement>('bottom-stack');
  const objectPos = requireEl<HTMLSpanElement>('object-pos');
  const imagePos = requireEl<HTMLSpanElement>('image-pos');
  const focalLen = requireEl<HTMLSpanElement>('focal-len');
  const lensToggle = requireEl<HTMLDivElement>('lens-toggle');
  const primaryBtn = requireEl<HTMLButtonElement>('primary-btn');

  primaryBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handlers.onPrimaryAction();
  });

  lensToggle.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const which = target.getAttribute('data-lens') as LensType | null;
    if (!which) return;
    handlers.onLensTypeChange(which);
  });

  subscribe((s) => {
    // Bottom stack visibility: shown once we're past placing the wall.
    bottomStack.setAttribute('data-state', s.phase === 'place-wall' ? 'hidden' : 'visible');

    // Primary button label per phase.
    if (s.phase === 'place-wall') {
      primaryBtn.textContent = 'Tap a wall to place screen';
      primaryBtn.disabled = true;
      primaryBtn.removeAttribute('data-mode');
    } else if (s.phase === 'place-lens') {
      primaryBtn.textContent = 'Tap to place lens';
      primaryBtn.disabled = true;
      primaryBtn.removeAttribute('data-mode');
    } else if (s.phase === 'aiming') {
      primaryBtn.textContent = 'Snap';
      primaryBtn.disabled = false;
      primaryBtn.setAttribute('data-mode', 'snap');
    } else {
      primaryBtn.textContent = 'Resume Aim';
      primaryBtn.disabled = false;
      primaryBtn.setAttribute('data-mode', 'resume');
    }

    // Lens-toggle active state.
    for (const btn of lensToggle.querySelectorAll('button')) {
      const which = btn.getAttribute('data-lens');
      btn.classList.toggle('active', which === s.lensType);
    }

    // Top properties card.
    if (s.phase === 'aiming' || s.phase === 'snapped') {
      topCard.setAttribute('data-state', 'visible');
      if (s.props) {
        const cls = s.props.real ? 'real' : 'virtual';
        propsLine.innerHTML = s.props.summary
          .split(' · ')
          .map((p, i) =>
            i === 0 ? `<span class="${cls}">${escapeHtml(p)}</span>` : `<span class="sep">·</span>${escapeHtml(p)}`,
          )
          .join(' ');
      } else {
        propsLine.textContent = 'Move closer to the lens';
      }
    } else {
      topCard.setAttribute('data-state', 'hidden');
    }

    // Bottom data card values.
    objectPos.textContent = s.props
      ? labelForRegion(s.props.objectRegion)
      : s.phase === 'aiming'
        ? '—'
        : 'place lens first';
    imagePos.textContent = s.props ? labelForRegion(s.props.imageRegion) : '—';
    focalLen.textContent = s.fAbs > 0 ? `${(s.fAbs * 100).toFixed(0)} cm` : '—';
  });

  return {
    setStatus(text, tone = null) {
      statusPill.textContent = text;
      if (tone) statusPill.setAttribute('data-tone', tone);
      else statusPill.removeAttribute('data-tone');
    },
    show() {
      overlay.setAttribute('aria-hidden', 'false');
      const splash = document.getElementById('splash');
      if (splash) splash.style.display = 'none';
      setState({ overlayShown: true });
    },
    hide() {
      overlay.setAttribute('aria-hidden', 'true');
      const splash = document.getElementById('splash');
      if (splash) splash.style.display = '';
      setState({ overlayShown: false });
    },
  };
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required element #${id} not found`);
  return el as T;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

// Keep getState for callers that import only this module.
export { getState };
