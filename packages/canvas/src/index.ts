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
}

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

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = boneWidth;
    ctx.strokeStyle = theme.bone;
    ctx.beginPath();
    for (const [a, b] of figure.bones()) {
      if (b.name === "head") continue;
      const p = a.worldPosition;
      const q = b.worldPosition;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();

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

    for (const node of figure.nodes) {
      const p = node.worldPosition;
      ctx.beginPath();
      ctx.fillStyle = node === figure.root ? theme.root : theme.joint;
      ctx.arc(p.x, p.y, jointR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (opts.hover && opts.hover.amount > 0.001) this.#ring(opts.hover.node, opts.hover.amount, jointR, 0.35);
    if (opts.focus && opts.focus.amount > 0.001) this.#ring(opts.focus.node, opts.focus.amount, jointR, 1);
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
