# AR Optics

A WebXR augmented-reality lens ray-diagram sandbox. Place a wall, place a lens, then walk around — the phone's position is the **object**. Image properties (real/virtual, inverted/upright, magnified/diminished) update live, the image candle appears at the math-correct 3D position, and a **Snap** button freezes the scene with the three principal rays so you can walk around the diagram.

Built with **Three.js + Vite + TypeScript**, deployed to **GitHub Pages** at `https://kushagra-wu.github.io/ar-optics/`.

## Run locally

```bash
npm install
npm run dev
```

Then open the LAN URL printed in the terminal on a WebXR-capable device. The dev server uses `@vitejs/plugin-basic-ssl` for HTTPS (WebXR requires it). Accept the self-signed cert warning on first visit.

## Device matrix

| Device | Browser | AR | Notes |
| --- | --- | --- | --- |
| Android phone (ARCore) | Chrome | ✅ | Primary target |
| Meta Quest 2/3/Pro | Meta Quest Browser | ✅ | Camera passthrough |
| Apple Vision Pro | Safari | ✅ | |
| Desktop / iPhone Safari / Firefox | — | ❌ | Shows fallback message |

## Lens math

Plain thin-lens equation, no thick-lens or aberration corrections:

$$
\frac{1}{v} = \frac{1}{f} - \frac{1}{u}, \qquad m = -\frac{v}{u}
$$

- `u > 0` always (object distance from lens)
- `f > 0` for convex (converging), `f < 0` for concave (diverging)
- `v > 0` → real image, opposite side of lens; `v < 0` → virtual image, same side as object
- `|m| > 1` → magnified, otherwise diminished

`F` (focal length) is auto-derived at lens-placement time as `F = wall-to-lens distance / 2`, so a textbook "object at 2F → image on the wall" demo just works.

## Architecture

```
src/
  main.ts                 # WebGL + ARButton + animation loop
  physics/lens.ts         # Pure thin-lens math
  xr/hitTest.ts           # XRHitTestSource lifecycle
  scene/reticle.ts        # Hit-test reticle (blue ring)
  scene/wall.ts           # Translucent screen plane
  scene/lens.ts           # Convex/concave lens with switchable geometry
  scene/candle.ts         # Candle mesh (object + image)
  scene/image.ts          # Image candle: positioned/scaled/styled per math
  scene/rays.ts           # 3 principal-ray cylinder meshes (snap mode)
  scene/axisHint.ts       # Faint dotted line: viewer → projected position on optical axis
  ui/state.ts             # Tiny event-emitter store
  ui/overlay.ts           # DOM bindings (sliders, button, status pill)
  styles.css              # Mobile-first overlay
```

### Coordinate convention

After both wall and lens are placed:
- Wall center stored in world coordinates; wall normal points toward the user.
- Lens center stored in world coordinates; **optical axis** = unit vector from lens toward the wall, locked horizontal.
- Object distance `u` = projection of (viewer − lens) onto the optical axis (negated so positive on the user's side).

## Deploy

The repo's `main` branch deploys automatically to GitHub Pages via `.github/workflows/deploy.yml`. First push enables Pages (`enablement: true`).
