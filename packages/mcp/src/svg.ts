import type { Figure, Figure3D } from "@animeant/core";

export type View3D = "front" | "side" | "top" | "three-quarter";

export interface SvgOptions {
  width?: number;
  height?: number;
  /** 3D only. Default "three-quarter". */
  view?: View3D;
  /** Node names to draw in the accent color. */
  highlight?: string[];
  /** Extra world points to mark, e.g. IK targets. */
  markers?: { x: number; y: number; z?: number; label?: string }[];
  background?: string;
}

interface P2 { x: number; y: number; depth: number; }

const BONE = "#1d1d1f";
const ACCENT = "#0a84ff";
const MUTED = "#a1a1a6";

/** Project a 3D world point (y up) to a 2D point (y down) for a named view. */
function project(p: { x: number; y: number; z: number }, view: View3D): P2 {
  switch (view) {
    case "front": return { x: p.x, y: -p.y, depth: p.z };
    case "side": return { x: p.z, y: -p.y, depth: -p.x };
    case "top": return { x: p.x, y: p.z, depth: p.y };
    case "three-quarter": {
      const a = (-35 * Math.PI) / 180, t = (15 * Math.PI) / 180;
      const x = p.x * Math.cos(a) + p.z * Math.sin(a);
      const z = -p.x * Math.sin(a) + p.z * Math.cos(a);
      const y = p.y * Math.cos(t) - z * Math.sin(t);
      return { x, y: -y, depth: z * Math.cos(t) + p.y * Math.sin(t) };
    }
  }
}

/**
 * Draw a figure as a standalone SVG string: bones, joints, a head, and any
 * markers. 2D figures use their own coordinates (y down); 3D figures are
 * projected orthographically from `view`.
 */
export function figureToSvg(figure: Figure | Figure3D, opts: SvgOptions = {}): string {
  const width = opts.width ?? 480;
  const height = opts.height ?? 480;
  const is3D = "z" in figure.root;
  const view = opts.view ?? "three-quarter";
  const hl = new Set(opts.highlight ?? []);

  const pts = new Map<string, P2>();
  for (const n of figure.nodes) {
    const w = n.worldPosition as { x: number; y: number; z?: number };
    pts.set(n.name, is3D ? project({ x: w.x, y: w.y, z: w.z ?? 0 }, view) : { x: w.x, y: w.y, depth: 0 });
  }
  const markers = (opts.markers ?? []).map((m) => ({
    ...(is3D ? project({ x: m.x, y: m.y, z: m.z ?? 0 }, view) : { x: m.x, y: m.y, depth: 0 }),
    label: m.label,
  }));

  // Fit everything (plus a head allowance) into the canvas with padding.
  const all = [...pts.values(), ...markers];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of all) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const headR = is3D ? 0.11 : 18;
  minY -= headR * 2.2; minX -= headR; maxX += headR;
  const pad = 28;
  const s = Math.min((width - pad * 2) / Math.max(maxX - minX, span * 0.3), (height - pad * 2) / Math.max(maxY - minY, span * 0.3));
  const ox = width / 2 - ((minX + maxX) / 2) * s;
  const oy = height / 2 - ((minY + maxY) / 2) * s;
  const X = (p: P2) => (p.x * s + ox).toFixed(1);
  const Y = (p: P2) => (p.y * s + oy).toFixed(1);

  const unit = is3D ? s * 0.03 : s;
  const bones: { d: number; svg: string }[] = [];
  for (const [a, b] of figure.bones() as Iterable<[{ name: string; meta: Record<string, unknown> }, { name: string; meta: Record<string, unknown> }]>) {
    const w = b.meta.boneWidth;
    if (w === 0) continue;
    const pa = pts.get(a.name)!, pb = pts.get(b.name)!;
    const sw = typeof w === "number" ? w * (is3D ? unit / 3 : 1) : is3D ? Math.max(2, unit) : 6;
    const color = hl.has(b.name) || hl.has(a.name) ? ACCENT : BONE;
    bones.push({
      d: (pa.depth + pb.depth) / 2,
      svg: `<line x1="${X(pa)}" y1="${Y(pa)}" x2="${X(pb)}" y2="${Y(pb)}" stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`,
    });
  }
  bones.sort((p, q) => p.d - q.d);

  const joints: string[] = [];
  const jr = is3D ? Math.max(2.5, unit * 0.9) : 4;
  for (const [name, p] of pts) {
    const node = figure.node(name) as { meta: Record<string, unknown> };
    if (typeof node.meta.boneWidth === "number" || node.meta.hidden) continue;
    const color = hl.has(name) ? ACCENT : "#ffffff";
    joints.push(`<circle cx="${X(p)}" cy="${Y(p)}" r="${jr.toFixed(1)}" fill="${color}" stroke="${BONE}" stroke-width="1.5"><title>${name}</title></circle>`);
  }

  let head = "";
  if (figure.has("head")) {
    const h = figure.node("head");
    let c: P2;
    if (is3D) {
      const m = h.worldMatrix;
      // Head center sits one radius up the head's local y.
      c = project({ x: m[12]! + m[4]! * headR, y: m[13]! + m[5]! * headR, z: m[14]! + m[6]! * headR }, view);
    } else {
      const m = h.worldMatrix;
      c = { x: m[4]! + m[2]! * -headR, y: m[5]! + m[3]! * -headR, depth: 0 };
    }
    head = `<circle cx="${X(c)}" cy="${Y(c)}" r="${(headR * s).toFixed(1)}" fill="none" stroke="${hl.has("head") ? ACCENT : BONE}" stroke-width="${is3D ? Math.max(2, unit).toFixed(1) : "5"}"/>`;
  }

  const marks = markers.map((m) =>
    `<g><circle cx="${X(m)}" cy="${Y(m)}" r="7" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="3 3"/>` +
    (m.label ? `<text x="${(Number(X(m)) + 10).toFixed(1)}" y="${(Number(Y(m)) - 10).toFixed(1)}" font-family="system-ui, sans-serif" font-size="11" fill="${ACCENT}">${escape(m.label)}</text>` : "") +
    `</g>`,
  );

  const caption = is3D ? `<text x="${pad}" y="${height - 10}" font-family="system-ui, sans-serif" font-size="11" fill="${MUTED}">${view} view</text>` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${opts.background ?? "#f5f5f7"}"/>`,
    ...bones.map((b) => b.svg),
    head,
    ...joints,
    ...marks,
    caption,
    `</svg>`,
  ].join("\n");
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
