# animeant

Code-first 2D skeletal animation for the web, modeled around **nodes**, not whole figures.

```ts
import { Figure } from "@animeant/core";

const fig = Figure.fromRig(humanoid);

// Forward kinematics: rotate a joint, everything below follows.
fig.node("shoulderR").rotation = -0.6;

// Inverse kinematics: put the hand somewhere, the elbow works it out.
fig.chain("handR").solve({ x: 240, y: 120 });         // FABRIK
fig.chain("footL").solve(target, { solver: "ccd" });  // or CCD
```

## Packages

| Package | What |
|---|---|
| `@animeant/core` | Node graph, math, FK, joint limits, FABRIK/CCD IK, fixed-step ticker |
| `@animeant/canvas` | Canvas2D renderer with focus, effector, target and limit overlays |
| `packages/wasm` | Rust hot paths, reserved until profiling says so |
| `apps/playground` | Live demo and docs |

## Develop

```bash
pnpm install
pnpm dev      # playground
pnpm test     # unit tests
```

See [DECISIONS.md](DECISIONS.md) for the architecture calls.
