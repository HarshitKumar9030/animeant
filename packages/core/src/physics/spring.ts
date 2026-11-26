import type { Vec2 } from "../math/vec2";
import type { Node } from "../node";
import { Chain } from "../ik/chain";
import { aimAt } from "./aim";

export interface SpringOptions {
  /** 0..1, how hard each step pulls back toward the driven pose. Default 0.06. */
  stiffness?: number;
  /** Velocity kept per step, 0..1. Default 0.92. */
  damping?: number;
  /** World-space acceleration in units/s². Default { x: 0, y: 900 }. */
  gravity?: Vec2;
}

interface P { x: number; y: number; px: number; py: number; }

/**
 * Secondary motion for a dangling chain (hair, a tail, a scarf). The first
 * joint follows whatever drives it; the rest lag behind as verlet particles
 * pulled softly toward the pose an animator or user set, then the result is
 * written back as rotations so bone lengths and limits hold exactly.
 *
 * It remembers the driven pose: if nothing else writes the joints between
 * steps, it springs toward the last pose someone else set, not its own output.
 */
export class SpringChain {
  readonly joints: readonly Node[];
  stiffness: number;
  damping: number;
  gravity: Vec2;
  #parts: P[] = [];
  #drive: number[] = [];
  #written: number[] = [];

  constructor(chain: Chain | readonly Node[], opts: SpringOptions = {}) {
    this.joints = chain instanceof Chain ? chain.joints : new Chain(chain).joints;
    this.stiffness = opts.stiffness ?? 0.06;
    this.damping = opts.damping ?? 0.92;
    this.gravity = opts.gravity ?? { x: 0, y: 900 };
    this.reset();
  }

  /** Snap particles to the current pose and forget velocity. */
  reset(): void {
    this.#drive = this.joints.map((j) => j.rotation);
    this.#written = [...this.#drive];
    this.#parts = this.joints.map((j) => {
      const w = j.worldPosition;
      return { x: w.x, y: w.y, px: w.x, py: w.y };
    });
  }

  step(dt: number): void {
    const js = this.joints;
    const n = js.length;

    // Pick up any pose set by someone else since our last write.
    for (let i = 0; i < n - 1; i++) {
      if (js[i]!.rotation !== this.#written[i]) this.#drive[i] = js[i]!.rotation;
      js[i]!.rotation = this.#drive[i]!;
    }
    const targets = js.map((j) => j.worldPosition);

    const gx = this.gravity.x * dt * dt;
    const gy = this.gravity.y * dt * dt;
    const base = this.#parts[0]!;
    base.px = base.x = targets[0]!.x;
    base.py = base.y = targets[0]!.y;

    for (let i = 1; i < n; i++) {
      const p = this.#parts[i]!;
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + gx + (targets[i]!.x - p.x) * this.stiffness;
      p.y += vy + gy + (targets[i]!.y - p.y) * this.stiffness;
    }

    // Write back from the base outward; FK keeps lengths and limits exact.
    for (let i = 0; i < n - 1; i++) {
      const node = js[i]!;
      const next = js[i + 1]!;
      aimAt(node, node.children.map((c) => (c === next ? this.#parts[i + 1] : undefined)));
      this.#written[i] = node.rotation;
    }
    // Project particles onto the solved pose; the correction becomes velocity.
    for (let i = 1; i < n; i++) {
      const w = js[i]!.worldPosition;
      this.#parts[i]!.x = w.x;
      this.#parts[i]!.y = w.y;
    }
  }
}
