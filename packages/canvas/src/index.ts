import type { Figure, Node } from "@animeant/core";

export interface CanvasTheme {
  bone: string;
  joint: string;
  root: string;
  accent: string;
  head: string;
}

export interface DrawOptions {
  /** Node to emphasize, with a 0..1 strength so hosts can ease it in and out. */
  focus?: { node: Node; amount: number } | null;
  /** Node under the pointer, eased the same way. */
  hover?: { node: Node; amount: number } | null;
  boneWidth?: number;
  jointRadius?: number;
  /** Draw the last node named "head" as a circle. */
  headRadius?: number;
  /** Joints that can be dragged as IK end effectors, drawn as hollow rings. */
  effectors?: { nodes: readonly Node[]; amount: number } | null;
  /** An IK goal: a crosshair, solid when reached. */
  target?: { x: number; y: number; amount: number; reached: boolean } | null;
  /** Show a node's allowed rotation range as a wedge. */
  limits?: { node: Node; amount: number } | null;
  /** A ground line at this y, eased in by amount. */
  floor?: { y: number; amount: number } | null;
}

/** Per-bone width from the child node's `meta.boneWidth` (0 hides the bone). */
const metaWidth = (n: Node): number | undefined =>
  typeof n.meta.boneWidth === "number" ? n.meta.boneWidth : undefined;

export const defaultTheme: CanvasTheme = {
  bone: "#1d1d1f",
  joint: "#1d1d1f",
  root: "#86868b",
  accent: "#0a84ff",
  head: "#1d1d1f",
};

/**
 * Draws figures to a 2D canvas. Owns device-pixel-ratio sizing so callers
 * think in CSS pixels. Reads world transforms only; never mutates nodes.
 */
export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  theme: CanvasTheme;
  width = 0;
  height = 0;
  #dpr = 1;

  constructor(canvas: HTMLCanvasElement, theme: Partial<CanvasTheme> = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Animeant: 2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.theme = { ...defaultTheme, ...theme };
  }

  /** Match the backing store to the element's CSS size. Call on resize. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.#dpr);
    this.canvas.height = Math.round(rect.height * this.#dpr);
  }

  clear(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
  }

  draw(figure: Figure, opts: DrawOptions = {}): void {
    const { ctx, theme } = this;
    const boneWidth = opts.boneWidth ?? 4;
    const jointR = opts.jointRadius ?? 4.5;
    const headR = opts.headRadius ?? 16;

    if (opts.floor && opts.floor.amount > 0.001) {
      ctx.save();
      ctx.globalAlpha = 0.35 * opts.floor.amount;
      ctx.strokeStyle = theme.root;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(0, opts.floor.y + 0.5);
      ctx.lineTo(this.width, opts.floor.y + 0.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = theme.bone;
    // Group bones by width so each width is one stroke.
    const groups = new Map<number, [Node, Node][]>();
    for (const bone of figure.bones()) {
      if (bone[1].name === "head") continue;
      const custom = metaWidth(bone[1]);
      const w = custom === undefined ? boneWidth : custom * (boneWidth / 4);
      if (w <= 0) continue;
      let g = groups.get(w);
      if (!g) groups.set(w, (g = []));
      g.push(bone);
    }
    for (const [w, bones] of groups) {
      ctx.lineWidth = w;
      ctx.beginPath();
      for (const [a, b] of bones) {
        const p = a.worldPosition;
        const q = b.worldPosition;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }

    if (figure.has("head")) {
      const head = figure.node("head");
      const neck = head.parent;
      const h = head.worldPosition;
      const n = neck?.worldPosition ?? h;
      // Put the head's centre one radius past the head joint, along the neck.
      const dx = h.x - n.x;
      const dy = h.y - n.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = h.x + (dx / len) * headR * 0.6;
      const cy = h.y + (dy / len) * headR * 0.6;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, headR, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (opts.limits && opts.limits.amount > 0.001) this.#limitWedge(opts.limits.node, opts.limits.amount);

    for (const node of figure.nodes) {
      const p = node.worldPosition;
      const custom = metaWidth(node);
      // Thin, decorative chains get small joints; a hidden anchor gets none.
      const r = custom === undefined ? jointR : custom === 0 ? 0 : jointR * 0.6;
      if (r <= 0) continue;
      ctx.beginPath();
      ctx.fillStyle = node === figure.root ? theme.root : theme.joint;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (opts.effectors && opts.effectors.amount > 0.001) {
      ctx.save();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75 * opts.effectors.amount;
      for (const n of opts.effectors.nodes) {
        const p = n.worldPosition;
        ctx.beginPath();
        ctx.arc(p.x, p.y, jointR + 4 + 2 * opts.effectors.amount, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (opts.target && opts.target.amount > 0.001) this.#target(opts.target);
    if (opts.hover && opts.hover.amount > 0.001) this.#ring(opts.hover.node, opts.hover.amount, jointR, 0.35);
    if (opts.focus && opts.focus.amount > 0.001) this.#ring(opts.focus.node, opts.focus.amount, jointR, 1);
  }

  #limitWedge(node: Node, amount: number): void {
    const child = node.children[0];
    if (!node.limits || !child) return;
    const { ctx, theme } = this;
    const p = node.worldPosition;
    // World angle of the bone at local rotation 0, then add the limits.
    const rest = node.worldRotation - node.rotation + Math.atan2(child.y, child.x);
    const [min, max] = node.limits;
    const r = 34;
    ctx.save();
    ctx.globalAlpha = 0.14 * amount;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, r * (0.7 + 0.3 * amount), rest + min, rest + max);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.5 * amount;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * (0.7 + 0.3 * amount), rest + min, rest + max);
    ctx.stroke();
    ctx.restore();
  }

  #target(t: { x: number; y: number; amount: number; reached: boolean }): void {
    const { ctx, theme } = this;
    const s = 6 + 4 * t.amount;
    ctx.save();
    ctx.globalAlpha = t.amount;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(t.x - s, t.y); ctx.lineTo(t.x - 3, t.y);
    ctx.moveTo(t.x + 3, t.y); ctx.lineTo(t.x + s, t.y);
    ctx.moveTo(t.x, t.y - s); ctx.lineTo(t.x, t.y - 3);
    ctx.moveTo(t.x, t.y + 3); ctx.lineTo(t.x, t.y + s);
    ctx.stroke();
    if (!t.reached) {
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, s + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  #ring(node: Node, amount: number, jointR: number, alpha: number): void {
    const { ctx, theme } = this;
    const p = node.worldPosition;
    ctx.save();
    ctx.globalAlpha = alpha * amount;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, jointR + 1 + 3 * amount, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.16 * amount * alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, jointR + 6 + 8 * amount, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
