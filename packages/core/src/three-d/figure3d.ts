import type { Quat } from "../math3d/quat";
import { Chain3D } from "./chain3d";
import { Node3D, type Limits3 } from "./node3d";

export interface Rig3DNode {
  name: string;
  /** Parent name. Omit for the root. */
  parent?: string;
  /** Local offset from the parent joint. */
  x?: number;
  y?: number;
  z?: number;
  /** Local rest rotation, XYZ Euler, radians. */
  rx?: number;
  ry?: number;
  rz?: number;
  limits?: Limits3;
  meta?: Record<string, unknown>;
}

export interface Rig3D {
  name?: string;
  /** Marks the rig as 3D in JSON. */
  dimensions?: 3;
  nodes: Rig3DNode[];
}

/** A named tree of 3D nodes with one root. The 3D twin of `Figure`. */
export class Figure3D {
  readonly root: Node3D;
  readonly #byName = new Map<string, Node3D>();

  constructor(root: Node3D) {
    this.root = root;
    for (const n of root.walk()) {
      if (this.#byName.has(n.name)) throw new Error(`Animeant: duplicate node "${n.name}"`);
      this.#byName.set(n.name, n);
    }
  }

  static fromRig(rig: Rig3D): Figure3D {
    const roots = rig.nodes.filter((n) => !n.parent);
    if (roots.length !== 1) throw new Error(`Animeant: a rig needs exactly one root, found ${roots.length}`);
    const nodes = new Map<string, Node3D>();
    for (const def of rig.nodes) {
      if (nodes.has(def.name)) throw new Error(`Animeant: duplicate node "${def.name}"`);
      nodes.set(def.name, new Node3D(def));
    }
    for (const def of rig.nodes) {
      if (!def.parent) continue;
      const parent = nodes.get(def.parent);
      if (!parent) throw new Error(`Animeant: "${def.name}" has unknown parent "${def.parent}"`);
      parent.add(nodes.get(def.name)!);
    }
    return new Figure3D(nodes.get(roots[0]!.name)!);
  }

  node(name: string): Node3D {
    const n = this.#byName.get(name);
    if (!n) throw new Error(`Animeant: no node named "${name}"`);
    return n;
  }

  has(name: string): boolean { return this.#byName.has(name); }

  get nodes(): Node3D[] { return [...this.root.walk()]; }

  *bones(): Generator<[Node3D, Node3D]> {
    for (const n of this.root.walk()) for (const c of n.children) yield [n, c];
  }

  /** A chain ending at `end`, reaching `links` bones toward the root, or explicit names base first. */
  chain(end: string, links?: number): Chain3D;
  chain(names: string[]): Chain3D;
  chain(arg: string | string[], links = 2): Chain3D {
    if (Array.isArray(arg)) return new Chain3D(arg.map((n) => this.node(n)));
    const joints: Node3D[] = [this.node(arg)];
    for (let i = 0; i < links; i++) {
      const p = joints[0]!.parent;
      if (!p) break;
      joints.unshift(p);
    }
    return new Chain3D(joints);
  }

  /** Snapshot local rotations as quaternions [x, y, z, w]. */
  pose(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const n of this.root.walk()) out[n.name] = [...n.quaternion];
    return out;
  }

  applyPose(pose: Record<string, ArrayLike<number>>): void {
    for (const [name, q] of Object.entries(pose)) {
      if (this.has(name)) this.node(name).setQuaternion(Float64Array.from(q) as Quat);
    }
  }
}
