import { Node } from "./node";

export interface RigNode {
  name: string;
  /** Parent name. Omit for the root. */
  parent?: string;
  /** Local offset from the parent joint. */
  x?: number;
  y?: number;
  /** Local rotation in radians. */
  rotation?: number;
  /** Allowed local rotation range in radians, [min, max]. */
  limits?: [number, number];
}

export interface Rig {
  name?: string;
  nodes: RigNode[];
}

/** A named tree of nodes with one root. */
export class Figure {
  readonly root: Node;
  readonly #byName = new Map<string, Node>();

  constructor(root: Node) {
    this.root = root;
    for (const n of root.walk()) this.#register(n);
  }

  static fromRig(rig: Rig): Figure {
    const roots = rig.nodes.filter((n) => !n.parent);
    if (roots.length !== 1) {
      throw new Error(`Animeant: a rig needs exactly one root, found ${roots.length}`);
    }
    const nodes = new Map<string, Node>();
    for (const def of rig.nodes) {
      if (nodes.has(def.name)) throw new Error(`Animeant: duplicate node "${def.name}"`);
      nodes.set(def.name, new Node(def));
    }
    for (const def of rig.nodes) {
      if (!def.parent) continue;
      const parent = nodes.get(def.parent);
      if (!parent) throw new Error(`Animeant: "${def.name}" has unknown parent "${def.parent}"`);
      parent.add(nodes.get(def.name)!);
    }
    return new Figure(nodes.get(roots[0]!.name)!);
  }

  #register(n: Node): void {
    if (this.#byName.has(n.name)) throw new Error(`Animeant: duplicate node "${n.name}"`);
    this.#byName.set(n.name, n);
  }

  node(name: string): Node {
    const n = this.#byName.get(name);
    if (!n) throw new Error(`Animeant: no node named "${name}"`);
    return n;
  }

  has(name: string): boolean {
    return this.#byName.has(name);
  }

  get nodes(): Node[] {
    return [...this.root.walk()];
  }

  /** Parent→child pairs, i.e. the bones to draw. */
  *bones(): Generator<[Node, Node]> {
    for (const n of this.root.walk()) for (const c of n.children) yield [n, c];
  }

  /** Snapshot local rotations, handy for resetting poses. */
  pose(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const n of this.root.walk()) out[n.name] = n.rotation;
    return out;
  }

  applyPose(pose: Record<string, number>): void {
    for (const [name, r] of Object.entries(pose)) if (this.has(name)) this.node(name).rotation = r;
  }
}
