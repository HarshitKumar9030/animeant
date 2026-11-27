import { quat, quatFromAxisAngle, quatFromUnitVectors, quatInvert, quatMultiply, quatRotate } from "../math3d/quat";
import { cross3, distance3, dot3, normalize3, scale3, sub3, type Vec3 } from "../math3d/vec3";
import type { SolveResult } from "../ik/chain";
import type { Node3D } from "./node3d";

export interface Solve3DOptions {
  /**
   * "ccd" handles hinges (elbows, knees) reliably; "fabrik" gives smoother
   * poses on free chains. Default "auto": ccd when the chain has a hinge.
   */
  solver?: "auto" | "fabrik" | "ccd";
  /** Max outer iterations. Default 16. */
  iterations?: number;
  /** Stop once the end is this close to the target, in world units. Default 0.001. */
  tolerance?: number;
}

/**
 * A run of 3D joints from base to end effector, each the direct parent of
 * the next. `solve` runs FABRIK on positions, then turns each joint by the
 * shortest rotation from its current bone to the solved one, applying
 * limits as it goes. Like 2D, only rotations change, so lengths are exact.
 */
export class Chain3D {
  readonly joints: readonly Node3D[];

  constructor(joints: readonly Node3D[]) {
    if (joints.length < 2) throw new Error("Animeant: a chain needs at least two joints");
    for (let i = 1; i < joints.length; i++) {
      if (joints[i]!.parent !== joints[i - 1]) {
        throw new Error(`Animeant: "${joints[i]!.name}" is not a child of "${joints[i - 1]!.name}"`);
      }
    }
    this.joints = joints;
  }

  get base(): Node3D { return this.joints[0]!; }
  get end(): Node3D { return this.joints[this.joints.length - 1]!; }

  get lengths(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.joints.length - 1; i++) {
      out.push(distance3(this.joints[i]!.worldPosition, this.joints[i + 1]!.worldPosition));
    }
    return out;
  }

  get reach(): number { return this.lengths.reduce((a, b) => a + b, 0); }

  solve(target: Vec3, opts: Solve3DOptions = {}): SolveResult {
    const ccd = opts.solver === "ccd" || ((opts.solver ?? "auto") === "auto" && this.joints.some((j) => hingeAxis(j)));
    const iterations = opts.iterations ?? (ccd ? 32 : 16);
    const tolerance = opts.tolerance ?? 0.001;
    // A straight hinge has no plane to bend in; nudge it toward its open side.
    for (let j = 1; j < this.joints.length - 1; j++) prebend(this.joints[j]!);
    let error = distance3(this.end.worldPosition, target);
    let i = 0;
    while (i < iterations && error > tolerance) {
      if (ccd) this.#ccdPass(target);
      else this.#pass(target);
      i++;
      const next = distance3(this.end.worldPosition, target);
      if (Math.abs(error - next) < 1e-7) { error = next; break; }
      error = next;
    }
    return { reached: error <= tolerance, error, iterations: i };
  }

  /** Each joint, end first, turns to swing the end effector toward the target. */
  #ccdPass(target: Vec3): void {
    for (let i = this.joints.length - 2; i >= 0; i--) aim3(this.joints[i]!, this.end, target);
  }

  #pass(target: Vec3): void {
    const n = this.joints.length;
    const pos = this.joints.map((j) => j.worldPosition);
    const len = this.lengths;
    const base = pos[0]!;
    pos[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) pos[i] = toward(pos[i + 1]!, pos[i]!, len[i]!);
    pos[0] = base;
    for (let i = 1; i < n; i++) pos[i] = toward(pos[i - 1]!, pos[i]!, len[i - 1]!);
    for (let i = 0; i < n - 1; i++) aim3(this.joints[i]!, this.joints[i + 1]!, pos[i + 1]!);
  }
}

const D = quat();
const P = quat();
const PI = quat();

type Axis = "x" | "y" | "z";
const AXES: readonly Axis[] = ["x", "y", "z"];
const KEY = { x: "rx", y: "ry", z: "rz" } as const;

/** The single free Euler axis when the other two are locked (min === max), else null. */
export function hingeAxis(node: Node3D): Axis | null {
  const l = node.limits;
  if (!l) return null;
  const free = AXES.filter((a) => { const r = l[a]; return !r || r[0] !== r[1]; });
  return free.length === 1 ? free[0]! : null;
}

/** The hinge axis in world space. With XYZ Euler, x is outermost, then y, then z. */
function hingeWorldAxis(node: Node3D, axis: Axis): Vec3 {
  const q = quat();
  const tmp = quat();
  if (axis !== "x") quatFromAxisAngle(q, { x: 1, y: 0, z: 0 }, node.rx);
  if (axis === "z") quatMultiply(q, q, quatFromAxisAngle(tmp, { x: 0, y: 1, z: 0 }, node.ry));
  const local = { x: axis === "x" ? 1 : 0, y: axis === "y" ? 1 : 0, z: axis === "z" ? 1 : 0 };
  const inParent = quatRotate(q, local);
  return node.parent ? quatRotate(node.parent.worldQuaternion, inParent) : inParent;
}

function prebend(node: Node3D): void {
  const axis = hingeAxis(node);
  const range = axis && node.limits?.[axis];
  if (!axis || !range) return;
  const k = KEY[axis];
  if (Math.abs(node[k]) > 0.02) return;
  const nudge = 0.25;
  if (range[1] >= nudge) node[k] = Math.min(range[1], Math.max(range[0], nudge));
  else if (range[0] <= -nudge) node[k] = Math.max(range[0], Math.min(range[1], -nudge));
}

const project = (v: Vec3, n: Vec3): Vec3 => normalize3(sub3(v, scale3(n, dot3(v, n))));

/**
 * Turn `joint` so the direction to `child` (any descendant) points at
 * `target`, as far as its limits allow.
 */
export function aim3(joint: Node3D, child: Node3D, target: Vec3): void {
  const p = joint.worldPosition;
  const from = normalize3(sub3(child.worldPosition, p));
  const to = normalize3(sub3(target, p));
  if (!from.x && !from.y && !from.z) return;
  if (!to.x && !to.y && !to.z) return;
  const axis = hingeAxis(joint);
  if (axis) {
    // Hinges only turn about their own axis: compare the bone and the target
    // as seen looking down that axis.
    const n = hingeWorldAxis(joint, axis);
    const f = project(from, n), t = project(to, n);
    if ((!f.x && !f.y && !f.z) || (!t.x && !t.y && !t.z)) return;
    const angle = Math.atan2(dot3(n, cross3(f, t)), dot3(f, t));
    const k = KEY[axis];
    const r = joint.limits![axis]!;
    joint[k] = Math.min(r[1], Math.max(r[0], joint[k] + angle));
    return;
  }
  // World delta D; in parent space it is P⁻¹ D P, applied after the local rotation.
  quatFromUnitVectors(D, from, to);
  if (joint.parent) {
    P.set(joint.parent.worldQuaternion);
    quatInvert(PI, P);
    quatMultiply(D, PI, D);
    quatMultiply(D, D, P);
  }
  joint.rotateBy(D);
}

function toward(from: Vec3, to: Vec3, length: number): Vec3 {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  return { x: from.x + (dx / d) * length, y: from.y + (dy / d) * length, z: from.z + (dz / d) * length };
}
