import type { Figure } from "../figure";
import type { Vec2 } from "../math/vec2";
import type { Node } from "../node";
import { aimAt } from "./aim";

export interface Bounds {
  left?: number;
  right?: number;
  floor?: number;
  ceiling?: number;
}

export interface RagdollOptions {
  /** World units/s². Default { x: 0, y: 1800 }. */
  gravity?: Vec2;
  /** Velocity kept per step. Default 0.995. */
  damping?: number;
  bounds?: Bounds;
  /** 0..1 of tangential speed lost on contact. Default 0.4. */
  friction?: number;
  /** 0..1 of normal speed kept on contact. Default 0.2. */
  bounce?: number;
  /** Constraint passes per step. Default 6. */
  iterations?: number;
}

interface P { node: Node; x: number; y: number; px: number; py: number; }
interface Link { a: P; b: P; length: number; }

/**
 * Verlet ragdoll over a figure. Each node becomes a particle; bones and the
 * spacing between siblings become distance constraints. After the particles
 * move, the pose is written back as rotations (plus the root's position), so
 * bone lengths and joint limits are exact, and the particles are projected
 * onto that pose. Grab any node to drag or fling it.
 */
export class Ragdoll {
  readonly figure: Figure;
  gravity: Vec2;
  damping: number;
  bounds: Bounds;
  friction: number;
  bounce: number;
  iterations: number;
  #parts = new Map<Node, P>();
  #list: P[] = [];
  /** Nodes with children, parent first, each with its children's particles. */
  #aims: { node: Node; targets: P[] }[] = [];
  #links: Link[] = [];
  #grab: { p: P; x: number; y: number } | null = null;
  #active = false;

  constructor(figure: Figure, opts: RagdollOptions = {}) {
    this.figure = figure;
    this.gravity = opts.gravity ?? { x: 0, y: 1800 };
    this.damping = opts.damping ?? 0.995;
    this.bounds = opts.bounds ?? {};
    this.friction = opts.friction ?? 0.4;
    this.bounce = opts.bounce ?? 0.2;
    this.iterations = opts.iterations ?? 6;
  }

  get active(): boolean { return this.#active; }
  get grabbed(): Node | null { return this.#grab?.p.node ?? null; }

  /** Begin simulating from the current pose, optionally with a starting velocity (units/s). */
  start(velocity: Vec2 = { x: 0, y: 0 }, dt = 1 / 120): void {
    this.#parts.clear();
    for (const node of this.figure.nodes) {
      const w = node.worldPosition;
      this.#parts.set(node, { node, x: w.x, y: w.y, px: w.x - velocity.x * dt, py: w.y - velocity.y * dt });
    }
    this.#links = [];
    const link = (a: Node, b: Node) => {
      const pa = this.#parts.get(a)!, pb = this.#parts.get(b)!;
      this.#links.push({ a: pa, b: pb, length: Math.hypot(pa.x - pb.x, pa.y - pb.y) });
    };
    for (const node of this.figure.nodes) {
      for (const c of node.children) link(node, c);
      // Siblings keep their spacing so branch points (hips, chest) stay rigid.
      for (let i = 0; i < node.children.length; i++)
        for (let j = i + 1; j < node.children.length; j++) link(node.children[i]!, node.children[j]!);
    }
    this.#list = [...this.#parts.values()];
    this.#aims = [];
    for (const node of this.figure.root.walk()) {
      if (node.children.length) this.#aims.push({ node, targets: node.children.map((c) => this.#parts.get(c)!) });
    }
    this.#active = true;
  }

  stop(): void {
    this.#active = false;
    this.#grab = null;
  }

  /** Pin a node to a world point until `release()`. */
  grab(node: Node, at: Vec2): void {
    const p = this.#parts.get(node);
    if (p) this.#grab = { p, x: at.x, y: at.y };
  }

  drag(at: Vec2): void {
    if (this.#grab) { this.#grab.x = at.x; this.#grab.y = at.y; }
  }

  /** Let go; the node keeps the velocity it was dragged with. */
  release(): void {
    this.#grab = null;
  }

  /** Apply a velocity change (units/s) to one node, or all. */
  impulse(v: Vec2, node?: Node, dt = 1 / 120): void {
    for (const p of node ? [this.#parts.get(node)!] : this.#parts.values()) {
      p.px -= v.x * dt;
      p.py -= v.y * dt;
    }
  }

  step(dt: number): void {
    if (!this.#active) return;
    const gx = this.gravity.x * dt * dt;
    const gy = this.gravity.y * dt * dt;
    const parts = this.#list;

    for (const p of parts) {
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + gx;
      p.y += vy + gy;
    }

    const g = this.#grab;
    for (let it = 0; it < this.iterations; it++) {
      if (g) { g.p.x = g.x; g.p.y = g.y; }
      for (const l of this.#links) {
        const dx = l.b.x - l.a.x;
        const dy = l.b.y - l.a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - l.length) / d;
        // A grabbed particle is immovable; the other end takes the whole fix.
        let wa = 0.5;
        let wb = 0.5;
        if (g && l.a === g.p) { wa = 0; wb = 1; }
        else if (g && l.b === g.p) { wa = 1; wb = 0; }
        l.a.x += dx * diff * wa;
        l.a.y += dy * diff * wa;
        l.b.x -= dx * diff * wb;
        l.b.y -= dy * diff * wb;
      }
      for (const p of parts) this.#collide(p);
    }
    if (g) { g.p.x = g.x; g.p.y = g.y; }

    this.#writeBack();
    const bx = this.figure.root.x, by = this.figure.root.y;
    // Write-back runs from the root out, so errors pile up at the far end of a
    // chain. Shift the whole body so the grabbed node sits exactly on the pointer.
    if (g) {
      const w = g.p.node.worldMatrix;
      this.figure.root.x += g.x - w[4]!;
      this.figure.root.y += g.y - w[5]!;
    }
    this.#pushInside();
    // Those rigid shifts are corrections, not motion: carry previous positions
    // along so they don't turn into velocity and pump energy into the body.
    const sx = this.figure.root.x - bx;
    const sy = this.figure.root.y - by;

    // Project onto the solved pose. Otherwise previous positions stay put, so
    // next step's velocity is the motion the figure actually made.
    for (const p of parts) {
      const w = p.node.worldMatrix;
      p.px += sx;
      p.py += sy;
      p.x = w[4]!;
      p.y = w[5]!;
    }
  }

  #collide(p: P): void {
    const { left, right, floor, ceiling } = this.bounds;
    const keepTangent = 1 - this.friction;
    if (floor !== undefined && p.y > floor) {
      const vy = p.y - p.py;
      p.y = floor;
      p.py = floor + vy * this.bounce;
      p.px = p.x - (p.x - p.px) * keepTangent;
    }
    if (ceiling !== undefined && p.y < ceiling) {
      const vy = p.y - p.py;
      p.y = ceiling;
      p.py = ceiling + vy * this.bounce;
    }
    if (left !== undefined && p.x < left) {
      const vx = p.x - p.px;
      p.x = left;
      p.px = left + vx * this.bounce;
      p.py = p.y - (p.y - p.py) * keepTangent;
    }
    if (right !== undefined && p.x > right) {
      const vx = p.x - p.px;
      p.x = right;
      p.px = right + vx * this.bounce;
      p.py = p.y - (p.y - p.py) * keepTangent;
    }
  }

  /** Write-back can leave a joint slightly outside; shift the whole figure in (rigid, so lengths hold). */
  #pushInside(): void {
    const { left, right, floor, ceiling } = this.bounds;
    let dx = 0;
    let dy = 0;
    for (const p of this.#list) {
      const w = p.node.worldMatrix;
      const x = w[4]!, y = w[5]!;
      if (floor !== undefined && y + dy > floor) dy = floor - y;
      if (ceiling !== undefined && y + dy < ceiling) dy = ceiling - y;
      if (left !== undefined && x + dx < left) dx = left - x;
      if (right !== undefined && x + dx > right) dx = right - x;
    }
    if (dx || dy) {
      this.figure.root.x += dx;
      this.figure.root.y += dy;
    }
  }

  #writeBack(): void {
    const root = this.figure.root;
    const rp = this.#parts.get(root)!;
    // The root has no parent, so its local position is its world position.
    root.x = rp.x;
    root.y = rp.y;
    for (const a of this.#aims) aimAt(a.node, a.targets);
  }
}
