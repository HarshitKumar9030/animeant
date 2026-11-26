import { angleDelta } from "../math/angle";
import { distance, type Vec2 } from "../math/vec2";
import type { Node } from "../node";

export type Solver = "fabrik" | "ccd";

export interface SolveOptions {
  /** Default "fabrik". CCD tends to behave better against tight limits. */
  solver?: Solver;
  /** Max outer iterations. Default 12. */
  iterations?: number;
  /** Stop once the end is this close to the target, in world units. Default 0.5. */
  tolerance?: number;
}

export interface SolveResult {
  /** End effector is within tolerance of the target. */
  reached: boolean;
  /** Final distance from end effector to target. */
  error: number;
  iterations: number;
}

/**
 * A run of joints from a base to an end effector, each the direct parent of
 * the next. Solving rotates every joint except the last so the end reaches a
 * world-space target. Only rotations change, so bone lengths are preserved,
 * and each joint's `limits` are enforced after every adjustment.
 */
export class Chain {
  readonly joints: readonly Node[];

  constructor(joints: readonly Node[]) {
    if (joints.length < 2) throw new Error("Animeant: a chain needs at least two joints");
    for (let i = 1; i < joints.length; i++) {
      if (joints[i]!.parent !== joints[i - 1]) {
        throw new Error(`Animeant: "${joints[i]!.name}" is not a child of "${joints[i - 1]!.name}"`);
      }
    }
    this.joints = joints;
  }

  get base(): Node { return this.joints[0]!; }
  get end(): Node { return this.joints[this.joints.length - 1]!; }

  /** Current world-space bone lengths. */
  get lengths(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.joints.length - 1; i++) {
      out.push(distance(this.joints[i]!.worldPosition, this.joints[i + 1]!.worldPosition));
    }
    return out;
  }

  get reach(): number {
    return this.lengths.reduce((a, b) => a + b, 0);
  }

  solve(target: Vec2, opts: SolveOptions = {}): SolveResult {
    const iterations = opts.iterations ?? 12;
    const tolerance = opts.tolerance ?? 0.5;
    const step = opts.solver === "ccd" ? () => this.#ccdPass(target) : () => this.#fabrikPass(target);

    let error = distance(this.end.worldPosition, target);
    let i = 0;
    while (i < iterations && error > tolerance) {
      step();
      i++;
      const next = distance(this.end.worldPosition, target);
      // Stalled against limits or an unreachable target: stop wasting passes.
      if (Math.abs(error - next) < 1e-4) { error = next; break; }
      error = next;
    }
    return { reached: error <= tolerance, error, iterations: i };
  }

  /** Rotate joint i so its bone points toward `dir` (a world-space point). */
  #aim(i: number, toward: Vec2): void {
    const joint = this.joints[i]!;
    const child = this.joints[i + 1]!;
    const p = joint.worldPosition;
    const c = child.worldPosition;
    const current = Math.atan2(c.y - p.y, c.x - p.x);
    const wanted = Math.atan2(toward.y - p.y, toward.x - p.x);
    // Parent space may be mirrored (negative scale); flip the turn to match.
    const m = joint.parent?.worldMatrix;
    const flip = m && m[0]! * m[3]! - m[1]! * m[2]! < 0 ? -1 : 1;
    joint.turn(angleDelta(current, wanted) * flip);
  }

  /** One backward + forward FABRIK sweep, then map positions back to rotations. */
  #fabrikPass(target: Vec2): void {
    const n = this.joints.length;
    const pos = this.joints.map((j) => j.worldPosition);
    const len = this.lengths;
    const base = pos[0]!;

    // Backward: pin the end to the target, walk to the base.
    pos[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) {
      pos[i] = toward(pos[i + 1]!, pos[i]!, len[i]!);
    }
    // Forward: pin the base back, walk to the end.
    pos[0] = base;
    for (let i = 1; i < n; i++) {
      pos[i] = toward(pos[i - 1]!, pos[i]!, len[i - 1]!);
    }
    // FK from the base so each joint aims at its solved child position,
    // with limits applied as we go.
    for (let i = 0; i < n - 1; i++) this.#aim(i, pos[i + 1]!);
  }

  /** One CCD sweep from the joint nearest the end back to the base. */
  #ccdPass(target: Vec2): void {
    const endIdx = this.joints.length - 1;
    for (let i = endIdx - 1; i >= 0; i--) {
      const joint = this.joints[i]!;
      const p = joint.worldPosition;
      const e = this.end.worldPosition;
      const current = Math.atan2(e.y - p.y, e.x - p.x);
      const wanted = Math.atan2(target.y - p.y, target.x - p.x);
      const m = joint.parent?.worldMatrix;
      const flip = m && m[0]! * m[3]! - m[1]! * m[2]! < 0 ? -1 : 1;
      joint.turn(angleDelta(current, wanted) * flip);
    }
  }
}

/** The point `length` away from `from`, in the direction of `to`. */
function toward(from: Vec2, to: Vec2, length: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * length, y: from.y + (dy / d) * length };
}
