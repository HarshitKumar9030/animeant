# animeant

Code-first 2D skeletal animation for the web, modeled around **nodes**, not whole figures.

```ts
import { Figure } from "@animeant/core";

const fig = Figure.fromRig(humanoid);
fig.node("shoulderR").rotation = -0.6; // the whole arm swings with it
```

## Packages

| Package | What |
|---|---|
| `@animeant/core` | Node graph, math, forward kinematics (IK, tweens, physics to come) |
| `@animeant/canvas` | Canvas2D renderer |
| `packages/wasm` | Rust hot paths, reserved until profiling says so |
| `apps/playground` | Live demo and docs |

## Develop

```bash
pnpm install
pnpm dev      # playground
pnpm test     # unit tests
```

See [DECISIONS.md](DECISIONS.md) for the architecture calls.
