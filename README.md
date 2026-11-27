# animeant

Code-first 2D skeletal animation for the web, modeled around **nodes**, not whole figures.

**[Try the playground →](https://harshitkumar9030.github.io/animeant/)**

```bash
npm install @animeant/core @animeant/canvas
```

```ts
import { Animator, Figure, Ragdoll, SpringChain, Tweens, humanoid, humanoidClips } from "@animeant/core";

const fig = Figure.fromRig(humanoid);

// Forward kinematics: rotate a joint, everything below follows.
fig.node("shoulderR").rotation = -0.6;

// Inverse kinematics: put the hand somewhere, the elbow works it out.
fig.chain("handR").solve({ x: 240, y: 120 });         // FABRIK
fig.chain("footL").solve(target, { solver: "ccd" });  // or CCD

// Clips: plain JSON, played in layers with crossfades.
const animator = new Animator(fig);
animator.play(humanoidClips.dance, { fade: 0.4 });
animator.play(humanoidClips.wave, { layer: 1 });      // waves while dancing

// Physics: secondary motion and ragdolls, written back as rotations.
const hair = new SpringChain(fig.chain(["hair1", "hair2", "hair3", "hair4"]));
const ragdoll = new Ragdoll(fig, { bounds: { floor: 400 } });
ragdoll.start();
ragdoll.grab(fig.node("handR"), pointer);              // drag and fling

// Tweens for one-off motion.
const tweens = new Tweens();
tweens.to(fig.node("head"), { rotation: 0.3 }, { duration: 0.5, ease: "outBack" });
```

Drive it with the fixed-step `Ticker` and draw with `@animeant/canvas`:

```ts
import { Ticker } from "@animeant/core";
import { CanvasRenderer } from "@animeant/canvas";

const renderer = new CanvasRenderer(canvas);
const ticker = new Ticker();
ticker.onFixed((dt) => { animator.update(dt); tweens.update(dt); hair.step(dt); });
ticker.onFrame(() => renderer.draw(fig));
ticker.start();
```

3D works the same way: `Figure3D.fromRig(humanoid3d)`, `Chain3D` IK with hinge joints, and the same `Animator` with `x y z rx ry rz` channels.

ESM only, zero runtime dependencies, written in TypeScript with types included.

## Packages

| Package | What |
|---|---|
| `@animeant/core` | Node graph, FK, joint limits, FABRIK/CCD IK, tweens, JSON clips, layered animator, spring chains, ragdoll, fixed-step ticker |
| `@animeant/canvas` | Canvas2D renderer: per-bone widths, focus, effector, target, limit and floor overlays |
| `@animeant/three` | three.js `FigureView` for 3D figures |
| `@animeant/mcp` | MCP server so AI agents can build, pose, solve, animate and render figures |
| `skills/animeant` | Agent skill: the API, conventions and pitfalls in one file |
| `packages/wasm` | Rust hot paths, reserved until profiling says so |
| `apps/playground` | Live demo and docs |

## Develop

```bash
pnpm install
pnpm dev      # playground
pnpm test     # unit tests
pnpm bench    # performance scenes (packages/core/bench)
```

See [DECISIONS.md](DECISIONS.md) for the architecture calls.
