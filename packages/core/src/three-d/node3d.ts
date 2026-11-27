import { compose, mat4, multiply4, type Mat4 } from "../math3d/mat4";
import { quat, quatFromEuler, quatMultiply, quatNormalize, quatToEuler, type Quat } from "../math3d/quat";
import type { Vec3 } from "../math3d/vec3";

/** Per-axis local Euler limits in radians (XYZ order). A missing axis is free. */
export interface Limits3 {
  x?: readonly [number, number];
  y?: readonly [number, number];
  z?: readonly [number, number];
}

export interface Node3DInit {
  name: string;
  x?: number;
  y?: number;
  z?: number;
  /** Local Euler rotation in radians, XYZ order. */
  rx?: number;
  ry?: number;
  rz?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  limits?: Limits3 | null;
  meta?: Record<string, unknown>;
}

const clampTo = (v: number, r?: readonly [number, number]) => (r ? Math.min(r[1], Math.max(r[0], v)) : v);

/**
 * A joint in a 3D figure. Same model as the 2D `Node`: a local transform
 * relative to its parent, world transforms rebuilt lazily when read.
 *
 * Rotation is a quaternion. `rx`/`ry`/`rz` expose it as XYZ Euler angles so
 * clips and tweens can animate single axes; solvers set the quaternion
 * directly with `setQuaternion`. Keep scale uniform for IK to stay exact.
 */
export class Node3D {
  readonly name: string;
  parent: Node3D | null = null;
  readonly children: Node3D[] = [];
  limits: Limits3 | null;
  meta: Record<string, unknown>;

  #p: Vec3;
  #s: Vec3;
  readonly #q: Quat = quat();
  /** Euler mirror of #q; authoritative while #eulerFresh. */
  #e: Vec3 = { x: 0, y: 0, z: 0 };
  #eulerFresh = true;

  readonly #world: Mat4 = mat4();
  readonly #worldQ: Quat = quat();
  #dirty = true;

  constructor(init: Node3DInit) {
    this.name = init.name;
    this.#p = { x: init.x ?? 0, y: init.y ?? 0, z: init.z ?? 0 };
    this.#s = { x: init.scaleX ?? 1, y: init.scaleY ?? 1, z: init.scaleZ ?? 1 };
    this.#e = { x: init.rx ?? 0, y: init.ry ?? 0, z: init.rz ?? 0 };
    quatFromEuler(this.#q, this.#e.x, this.#e.y, this.#e.z);
    this.limits = init.limits ?? null;
    this.meta = { ...init.meta };
    for (const axis of ["x", "y", "z"] as const) {
      const r = this.limits?.[axis];
      if (r && r[0] > r[1]) throw new Error(`Animeant: "${this.name}" has ${axis} limits with min > max`);
    }
  }

  get x() { return this.#p.x; }
  set x(v: number) { if (v !== this.#p.x) { this.#p.x = v; this.markDirty(); } }
  get y() { return this.#p.y; }
  set y(v: number) { if (v !== this.#p.y) { this.#p.y = v; this.markDirty(); } }
  get z() { return this.#p.z; }
  set z(v: number) { if (v !== this.#p.z) { this.#p.z = v; this.markDirty(); } }
  get scaleX() { return this.#s.x; }
  set scaleX(v: number) { if (v !== this.#s.x) { this.#s.x = v; this.markDirty(); } }
  get scaleY() { return this.#s.y; }
  set scaleY(v: number) { if (v !== this.#s.y) { this.#s.y = v; this.markDirty(); } }
  get scaleZ() { return this.#s.z; }
  set scaleZ(v: number) { if (v !== this.#s.z) { this.#s.z = v; this.markDirty(); } }

  #euler(): Vec3 {
    if (!this.#eulerFresh) { this.#e = quatToEuler(this.#q); this.#eulerFresh = true; }
    return this.#e;
  }
  #setEuler(axis: "x" | "y" | "z", v: number): void {
    const e = this.#euler();
    if (e[axis] === v) return;
    e[axis] = v;
    quatFromEuler(this.#q, e.x, e.y, e.z);
    this.markDirty();
  }

  get rx() { return this.#euler().x; }
  set rx(v: number) { this.#setEuler("x", v); }
  get ry() { return this.#euler().y; }
  set ry(v: number) { this.#setEuler("y", v); }
  get rz() { return this.#euler().z; }
  set rz(v: number) { this.#setEuler("z", v); }

  /** A copy of the local rotation. */
  get quaternion(): Quat { return Float64Array.from(this.#q); }

  setQuaternion(q: Quat): void {
    quatNormalize(this.#q, q);
    this.#eulerFresh = false;
    this.markDirty();
  }

  /** Rotate by `delta` in parent space (applied after the current rotation), then respect limits. */
  rotateBy(delta: Quat): void {
    quatMultiply(this.#q, delta, this.#q);
    this.setQuaternion(this.#q);
    this.constrain();
  }

  /** Clamp each Euler axis into `limits`. Returns true if it had to move. */
  constrain(): boolean {
    const l = this.limits;
    if (!l) return false;
    const e = this.#euler();
    const cx = clampTo(e.x, l.x), cy = clampTo(e.y, l.y), cz = clampTo(e.z, l.z);
    if (cx === e.x && cy === e.y && cz === e.z) return false;
    e.x = cx; e.y = cy; e.z = cz;
    quatFromEuler(this.#q, cx, cy, cz);
    this.markDirty();
    return true;
  }

  get isDirty() { return this.#dirty; }

  add(child: Node3D): this {
    if (child === this || this.isDescendantOf(child)) {
      throw new Error(`Animeant: adding "${child.name}" under "${this.name}" would create a cycle`);
    }
    child.parent?.remove(child);
    child.parent = this;
    this.children.push(child);
    child.markDirty();
    return this;
  }

  remove(child: Node3D): this {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      this.children.splice(i, 1);
      child.parent = null;
      child.markDirty();
    }
    return this;
  }

  isDescendantOf(other: Node3D): boolean {
    for (let p = this.parent; p; p = p.parent) if (p === other) return true;
    return false;
  }

  markDirty(): void {
    if (this.#dirty) return;
    this.#dirty = true;
    for (const c of this.children) c.markDirty();
  }

  #update(): void {
    if (!this.#dirty) return;
    compose(this.#world, this.#p, this.#q, this.#s);
    if (this.parent) {
      multiply4(this.#world, this.parent.worldMatrix, this.#world);
      quatMultiply(this.#worldQ, this.parent.worldQuaternion, this.#q);
    } else {
      this.#worldQ.set(this.#q);
    }
    this.#dirty = false;
  }

  get worldMatrix(): Mat4 { this.#update(); return this.#world; }

  /** World rotation, ignoring scale. Exact for uniform positive scale. */
  get worldQuaternion(): Quat { this.#update(); return this.#worldQ; }

  get worldPosition(): Vec3 {
    const m = this.worldMatrix;
    return { x: m[12]!, y: m[13]!, z: m[14]! };
  }

  /** Depth-first, parent before children. */
  *walk(): Generator<Node3D> {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
}
