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
