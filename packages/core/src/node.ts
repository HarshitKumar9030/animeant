import { fromTRS, identity, invert, multiply, rotationOf, transformPoint, type Mat2D } from "./math/mat2d";
import type { Vec2 } from "./math/vec2";

export interface NodeInit {
  name: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

/**
 * A joint in a figure. Holds a local transform relative to its parent and
 * lazily computes its world transform. Changing any local value marks this
 * node and every descendant dirty; world matrices rebuild on next read.
 */
export class Node {
  readonly name: string;
  parent: Node | null = null;
  readonly children: Node[] = [];

  #x: number;
  #y: number;
  #rotation: number;
  #scaleX: number;
  #scaleY: number;

  readonly #local: Mat2D = identity();
  readonly #world: Mat2D = identity();
  #dirty = true;

  constructor(init: NodeInit) {
    this.name = init.name;
    this.#x = init.x ?? 0;
    this.#y = init.y ?? 0;
    this.#rotation = init.rotation ?? 0;
    this.#scaleX = init.scaleX ?? 1;
    this.#scaleY = init.scaleY ?? 1;
  }

  get x() { return this.#x; }
  set x(v: number) { if (v !== this.#x) { this.#x = v; this.markDirty(); } }
  get y() { return this.#y; }
  set y(v: number) { if (v !== this.#y) { this.#y = v; this.markDirty(); } }
  get rotation() { return this.#rotation; }
  set rotation(v: number) { if (v !== this.#rotation) { this.#rotation = v; this.markDirty(); } }
  get scaleX() { return this.#scaleX; }
  set scaleX(v: number) { if (v !== this.#scaleX) { this.#scaleX = v; this.markDirty(); } }
  get scaleY() { return this.#scaleY; }
  set scaleY(v: number) { if (v !== this.#scaleY) { this.#scaleY = v; this.markDirty(); } }

  get isDirty() { return this.#dirty; }

  add(child: Node): this {
    if (child === this || this.isDescendantOf(child)) {
      throw new Error(`Animeant: adding "${child.name}" under "${this.name}" would create a cycle`);
    }
    child.parent?.remove(child);
    child.parent = this;
    this.children.push(child);
    child.markDirty();
    return this;
  }

  remove(child: Node): this {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      this.children.splice(i, 1);
      child.parent = null;
      child.markDirty();
    }
    return this;
  }

  isDescendantOf(other: Node): boolean {
    for (let p = this.parent; p; p = p.parent) if (p === other) return true;
    return false;
  }

  /** Invariant: a dirty node's descendants are all dirty, so we can stop early. */
  markDirty(): void {
    if (this.#dirty) return;
    this.#dirty = true;
    for (const c of this.children) c.markDirty();
  }

  get localMatrix(): Mat2D {
    return fromTRS(this.#local, this.#x, this.#y, this.#rotation, this.#scaleX, this.#scaleY);
  }

  get worldMatrix(): Mat2D {
    if (this.#dirty) {
      const local = this.localMatrix;
      if (this.parent) multiply(this.#world, this.parent.worldMatrix, local);
      else this.#world.set(local);
      this.#dirty = false;
    }
    return this.#world;
  }

  get worldPosition(): Vec2 {
    const m = this.worldMatrix;
    return { x: m[4]!, y: m[5]! };
  }

  get worldRotation(): number {
    return rotationOf(this.worldMatrix);
  }

  /** Convert a world-space point into this node's parent space (where x/y live). */
  worldToParent(p: Vec2): Vec2 {
    if (!this.parent) return { ...p };
    const inv = invert(new Float32Array(6), this.parent.worldMatrix);
    return inv ? transformPoint(inv, p) : { ...p };
  }

  /** Depth-first, parent before children. */
  *walk(): Generator<Node> {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
}
