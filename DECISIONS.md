# Decisions

Architecture calls and why. Newest at the bottom.

## 001 — Model around nodes, not figures
A figure is just a tree of nodes. You animate a hand, an elbow, a hip; the figure follows.
Every feature (FK, IK, physics, tweens) targets nodes.

## 002 — TypeScript first, Rust only where profiled
The public API and the core live in TypeScript. `packages/wasm` stays empty until a benchmark
proves a hot path. Crossing JS↔WASM per node per frame would erase the gain.

## 003 — No GSAP in the core
Animeant owns its clock, tweens and easing so the core has zero runtime dependencies and
time stays deterministic for physics. A GSAP adapter can come later as a separate package.

## 004 — Core never draws
`@animeant/core` produces world transforms; renderers (`@animeant/canvas`, later others) read them.

## 005 — Dirty-flag world transforms
Changing a node's local transform marks it and its descendants dirty. World matrices are
recomputed lazily, top-down, so reads are cheap and writes don't cascade work.

## 006 — One fixed-step clock
`Ticker` runs simulation (IK now, physics later) at a fixed 120 Hz and rendering once per
frame with an interpolation alpha. Deterministic regardless of frame rate; steps are capped
after stalls so a background tab can't spiral.

## 007 — IK writes rotations, never positions
Solvers compute goal positions (FABRIK) or angles (CCD) but only ever write local
rotations back to nodes. Bone lengths are preserved by construction, FK stays the single
source of truth, and joint limits are a simple clamp after each adjustment.

## 008 — Limits live on the node, in radians, relative to rest
`limits: [min, max]` on local rotation. Solvers and `constrain()` enforce them; the rig
author decides which way an elbow bends.

## 009 — Clips are plain JSON, keys are tuples
`{ duration, loop, units, tracks: { node: { channel: [[t, v, ease?], ...] } } }`. Compact
enough to hand-write, trivially serializable, compiled once to typed arrays and cached.

## 010 — Blend within a layer by weighted average, across layers by lerp
Sequential lerping makes a crossfade dip (the incoming clip swallows the outgoing one).
Override clips on one layer are averaged by weight, then that result blends over the layers
below by the layer's total weight (capped at 1). Additive clips add their delta from frame 0.

## 011 — Root translation is always root motion
Clip keys on the root's x/y are added to wherever the host placed the figure, never written
absolutely. Hosts that move the root call `animator.rebase(figure.root)` each step.

## 012 — Order of a simulation step
Host placement → Animator → IK (blended over the animated pose by a per-drag weight) →
Tweens. Each stage reads the previous stage's output, so IK can pin a hand on a dancing
figure, and a tween (like reset) wins while the animator fades out.

## 013 — Physics writes rotations too (position-based dynamics with FK projection)
Springs and the ragdoll simulate verlet particles, then write the result back as joint
rotations (plus the root's position) and project the particles onto that pose. Bone lengths
and joint limits are therefore exact by construction, renderers only ever read nodes, and the
same figure moves between animation, IK and physics with no conversion.

## 014 — Corrections are not motion
Velocity is the motion the figure actually made between steps. Rigid fix-ups (pinning the
grabbed node, pushing the body back inside bounds) shift previous positions too, so they don't
turn into velocity. Counting them as motion pumped energy into the ragdoll until it spun.

## 015 — Limits pick the right wrap
`Node.turn(delta)` resolves r, r±2π to whichever is inside or nearest the limits before
clamping. A shortest-path turn that crosses ±π could otherwise land at the wrong end of the
range and stick there forever. All solvers turn joints through it.

## 016 — Multi-child joints use a least-squares fit
Hips and chest have several children. Their rotation is the 2D Kabsch fit,
atan2(Σ cross, Σ dot), so long bones dominate and an 8px shoulder stub can't twist the chest.

## 017 — Hot paths allocate nothing; no WASM yet
Benchmarks live in `packages/core/bench` (`pnpm bench`). The first run showed the cost was
per-step allocation, not arithmetic: Maps and string keys in `Animator.apply`, arrays and
`{x, y}` objects in the ragdoll write-back. Fixing those in TypeScript made 100 layered
animators 1.7× faster (1.05 → 0.61 ms/step) and 100 ragdolls 1.7× faster (1.76 → 1.06 ms/step).
What remains is structural: every joint turn dirties its subtree, so FABRIK on a 64-joint chain
is O(n²) in matrix rebuilds. WASM would not fix that, and the node tree lives in JS objects, so
each step would copy every node across the boundary. `packages/wasm` stays empty until a scene
we care about misses its frame budget after the TypeScript is tight.

## 018 — 3D nodes keep a quaternion, expose Euler
`Node3D` stores its rotation as a quaternion (no gimbal lock for solvers) and exposes
`rx/ry/rz` as XYZ Euler so clips and tweens can animate one axis. The Euler mirror stays
authoritative while channels are being set, so sequential single-axis writes don't drift.
Limits are per-axis Euler ranges; an axis with min === max is locked.

## 019 — Hinges rotate only about their axis; hinge chains default to CCD
Clamping a free shortest-arc rotation onto one axis throws most of the bend away, and a straight
hinge has no plane to bend in, so FABRIK picks the wrong side. Hinge joints project the target
onto their plane and turn about their axis, straight hinges get a small bend toward their open
side before solving, and `solver: "auto"` uses CCD when a chain contains a hinge.

## 020 — One Animator for 2D and 3D
The Animator only needs `root`, `has(name)` and `node(name)` with numeric channel properties,
so it runs on both `Figure` and `Figure3D`. Clips declare channels; `units: "deg"` converts every
angle channel (`rotation`, `rx`, `ry`, `rz`).
