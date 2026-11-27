import {
  ANGLE_CHANNELS, Animator, CHANNELS, Figure, Figure3D, Ragdoll, compileClip, degToRad, dog3d, dog3dClips, hominids,
  humanoid, humanoid3d, humanoid3dClips, humanoidClips, radToDeg,
  type Channel, type Clip, type Key, type Node, type Node3D, type Rig, type Rig3D,
} from "@animeant/core";
import { figureToSvg, type SvgOptions } from "./svg";

export const RIGS: Record<string, Rig | Rig3D> = {
  humanoid, humanoid3d, dog3d,
  ape: hominids.ape, australopithecus: hominids.australopithecus, habilis: hominids.habilis,
  erectus: hominids.erectus, sapiens: hominids.sapiens,
};
export const CLIPS: Record<string, Clip> = {
  ...Object.fromEntries(Object.values(humanoidClips).map((c) => [c.name, c])),
  ...Object.fromEntries(Object.values(humanoid3dClips).map((c) => [c.name, c])),
  ...Object.fromEntries(Object.values(dog3dClips).map((c) => [c.name, c])),
};

type AnyFigure = Figure | Figure3D;
type AnyNode = Node | Node3D;

interface Entry {
  id: string;
  dims: 2 | 3;
  figure: AnyFigure;
  rig: Rig | Rig3D;
}

const round = (v: number, p = 3) => Math.round(v * 10 ** p) / 10 ** p;
const is3DRig = (rig: Rig | Rig3D): rig is Rig3D =>
  (rig as Rig3D).dimensions === 3 || rig.nodes.some((n) => "z" in n || "rx" in n || "ry" in n || "rz" in n);

/** Angles in and out of the studio are degrees; the core works in radians. */
const toCore = (channel: Channel, v: number) => (ANGLE_CHANNELS.includes(channel) ? degToRad(v) : v);
const fromCore = (channel: Channel, v: number) => (ANGLE_CHANNELS.includes(channel) ? radToDeg(v) : v);

export type PoseInput = Record<string, Partial<Record<Channel, number>>>;

/**
 * Holds named figures and does everything the MCP tools expose. Plain
 * methods returning plain data, so it is easy to test and reuse.
 */
export class Studio {
  readonly #figures = new Map<string, Entry>();
  #seq = 0;

  list(): { id: string; dims: number; rig: string; nodes: number }[] {
    return [...this.#figures.values()].map((e) => ({ id: e.id, dims: e.dims, rig: e.rig.name ?? "custom", nodes: e.figure.nodes.length }));
  }

  create(opts: { id?: string; preset?: string; rig?: Rig | Rig3D }): ReturnType<Studio["describe"]> {
    const rig = opts.rig ?? RIGS[opts.preset ?? "humanoid"];
    if (!rig) throw new Error(`Unknown preset "${opts.preset}". Presets: ${Object.keys(RIGS).join(", ")}`);
    const id = opts.id ?? `fig${++this.#seq}`;
    const dims = is3DRig(rig) ? 3 : 2;
    const figure = dims === 3 ? Figure3D.fromRig(rig as Rig3D) : Figure.fromRig(rig as Rig);
    this.#figures.set(id, { id, dims, figure, rig: structuredClone(rig) });
    return this.describe(id);
  }

  delete(id: string): boolean { return this.#figures.delete(id); }

  get(id: string): Entry {
    const e = this.#figures.get(id);
    if (!e) {
      const known = [...this.#figures.keys()];
      throw new Error(`No figure "${id}". ${known.length ? `Known: ${known.join(", ")}` : "Create one with create_figure first."}`);
    }
    return e;
  }

  #channels(e: Entry): Channel[] {
    return e.dims === 3 ? ["x", "y", "z", "rx", "ry", "rz"] : ["x", "y", "rotation"];
  }

  #nodeInfo(e: Entry, n: AnyNode) {
    const w = n.worldPosition as { x: number; y: number; z?: number };
    const local: Record<string, number> = {};
    for (const c of this.#channels(e)) local[c] = round(fromCore(c, (n as unknown as Record<Channel, number>)[c]), 2);
    let limits: unknown = undefined;
    if (e.dims === 3 && (n as Node3D).limits) {
      const l = (n as Node3D).limits!;
      limits = Object.fromEntries(Object.entries(l).map(([k, r]) => [`r${k}`, (r as readonly number[]).map((v) => round(radToDeg(v), 1))]));
    } else if (e.dims === 2 && (n as Node).limits) {
      limits = { rotation: (n as Node).limits!.map((v) => round(radToDeg(v), 1)) };
    }
    return {
      name: n.name,
      parent: n.parent?.name ?? null,
      local,
      world: e.dims === 3 ? { x: round(w.x), y: round(w.y), z: round(w.z!) } : { x: round(w.x, 1), y: round(w.y, 1) },
      ...(limits ? { limits } : {}),
    };
  }

  describe(id: string) {
    const e = this.get(id);
    return {
      id,
      dims: e.dims,
      rig: e.rig.name ?? "custom",
      conventions: e.dims === 3
        ? "Meters, y up, figure faces +z (its left is +x). Rotations are XYZ Euler degrees (rx, ry, rz) in parent space."
        : "Pixels, y down. rotation is degrees, positive turns clockwise on screen, relative to the parent.",
      nodes: e.figure.nodes.map((n) => this.#nodeInfo(e, n)),
    };
  }

  /** Set local channels. Rotations in degrees; limits are enforced. */
  setPose(id: string, pose: PoseInput, opts: { reset?: boolean } = {}) {
    const e = this.get(id);
    if (opts.reset) this.reset(id);
    const allowed = this.#channels(e).concat(e.dims === 3 ? ["scaleX", "scaleY", "scaleZ"] : ["scaleX", "scaleY"]);
    const clamped: string[] = [];
    for (const [name, channels] of Object.entries(pose)) {
      const node = e.figure.node(name) as AnyNode;
      for (const [c, v] of Object.entries(channels) as [Channel, number][]) {
        if (!allowed.includes(c)) throw new Error(`"${c}" isn't a ${e.dims}D channel. Use: ${allowed.join(", ")}`);
        (node as unknown as Record<Channel, number>)[c] = toCore(c, v);
      }
      if ((node as { constrain(): boolean }).constrain()) clamped.push(name);
    }
    return { changed: Object.keys(pose).map((n) => this.#nodeInfo(e, e.figure.node(n))), clampedToLimits: clamped };
  }

  /** Back to the rig's rest pose. */
  reset(id: string): void {
    const e = this.get(id);
    const fresh = e.dims === 3 ? Figure3D.fromRig(e.rig as Rig3D) : Figure.fromRig(e.rig as Rig);
    for (const n of fresh.nodes) {
      const target = e.figure.node(n.name) as unknown as Record<Channel, number>;
      for (const c of CHANNELS) {
        const v = (n as unknown as Record<Channel, number>)[c];
        if (typeof v === "number" && typeof target[c] === "number") target[c] = v;
      }
    }
  }

  solveIK(id: string, end: string, target: number[], opts: { links?: number; names?: string[]; solver?: string; iterations?: number } = {}) {
    const e = this.get(id);
    const t = { x: target[0] ?? 0, y: target[1] ?? 0, z: target[2] ?? 0 };
    let result;
    let joints: AnyNode[];
    if (e.dims === 3) {
      const f = e.figure as Figure3D;
      const chain = opts.names ? f.chain(opts.names) : f.chain(end, opts.links ?? 2);
      result = chain.solve(t, { solver: (opts.solver as "auto" | "fabrik" | "ccd") ?? "auto", ...(opts.iterations ? { iterations: opts.iterations } : {}) });
      joints = [...chain.joints];
    } else {
      const f = e.figure as Figure;
      const chain = opts.names ? f.chain(opts.names) : f.chain(end, opts.links ?? 2);
      result = chain.solve({ x: t.x, y: t.y }, { solver: opts.solver === "ccd" ? "ccd" : "fabrik", ...(opts.iterations ? { iterations: opts.iterations } : {}) });
      joints = [...chain.joints];
    }
    return {
      reached: result.reached,
      error: round(result.error, 4),
      iterations: result.iterations,
      chain: joints.map((n) => n.name),
      joints: joints.map((n) => this.#nodeInfo(e, n)),
    };
  }

  #resolveClip(clip: string | Clip): Clip {
    if (typeof clip !== "string") return clip;
    const c = CLIPS[clip];
    if (!c) throw new Error(`Unknown clip "${clip}". Presets: ${Object.keys(CLIPS).join(", ")}`);
    return c;
  }

  /** Check a clip against the format and, given a figure, its nodes, channels and limits. */
  validateClip(clip: Clip, id?: string) {
    const errors: string[] = [];
    const warnings: string[] = [];
    try { compileClip(clip); } catch (err) { errors.push((err as Error).message); }
    if (id && !errors.length) {
      const e = this.get(id);
      const deg = clip.units === "deg";
      for (const [name, channels] of Object.entries(clip.tracks)) {
        if (!e.figure.has(name)) { errors.push(`Unknown node "${name}"`); continue; }
        const node = e.figure.node(name) as unknown as Record<string, unknown> & { limits?: unknown };
        for (const [c, keys] of Object.entries(channels) as [Channel, Key[]][]) {
          if (typeof node[c] !== "number") { errors.push(`"${name}" has no "${c}" channel (${e.dims}D figure)`); continue; }
          for (const k of keys) {
            if (k[0] < 0 || k[0] > clip.duration) warnings.push(`${name}.${c}: key at ${k[0]}s is outside 0..${clip.duration}s`);
          }
          const range = limitFor(e, node, c);
          if (range) {
            const [lo, hi] = range.map((v) => (deg ? radToDeg(v) : v));
            for (const k of keys) {
              if (k[1] < lo! - 1e-6 || k[1] > hi! + 1e-6) warnings.push(`${name}.${c}: ${k[1]} at ${k[0]}s is outside the joint limit ${round(lo!, 1)}..${round(hi!, 1)}${deg ? "°" : ""}; clips aren't clamped, so the joint will pass its limit`);
            }
          } else if (ANGLE_CHANNELS.includes(c) && !deg && keys.some((k) => Math.abs(k[1]) > 2 * Math.PI)) {
            warnings.push(`${name}.${c}: values look like degrees but the clip has no units: "deg"`);
          }
        }
      }
    }
    return { valid: !errors.length, errors, warnings };
  }

  /**
   * Pose the figure as one or more clips look at `time`, starting from the
   * rest pose. Layers blend like the runtime Animator.
   */
  sampleClips(id: string, layers: { clip: string | Clip; time: number; layer?: number; mode?: "override" | "additive"; weight?: number }[]) {
    const e = this.get(id);
    this.reset(id);
    const animator = new Animator(e.figure as Figure);
    for (const l of layers) {
      const clip = this.#resolveClip(l.clip);
      animator.play(clip, { fade: 0, from: l.time, layer: l.layer ?? 0, mode: l.mode ?? "override", weight: l.weight ?? 1 });
    }
    animator.update(0);
    animator.clear();
    return this.describe(id);
  }

  /**
   * Build a clip JSON from a list of poses at times. Each pose maps node →
   * channel → value (rotations in degrees). Channels missing from a pose
   * simply have no key there.
   */
  buildClip(spec: { name: string; duration: number; loop?: boolean; ease?: string; keys: { t: number; pose: PoseInput; ease?: string }[] }, id?: string) {
    const tracks: Clip["tracks"] = {};
    for (const k of [...spec.keys].sort((a, b) => a.t - b.t)) {
      for (const [name, channels] of Object.entries(k.pose)) {
        for (const [c, v] of Object.entries(channels) as [Channel, number][]) {
          const node = (tracks[name] ??= {});
          const ease = k.ease ?? spec.ease;
          (node[c] ??= []).push(ease ? [k.t, v, ease as Key[2]] : [k.t, v]);
        }
      }
    }
    const clip: Clip = { name: spec.name, duration: spec.duration, ...(spec.loop ? { loop: true } : {}), units: "deg", tracks };
    return { clip, check: this.validateClip(clip, id) };
  }

  /** 2D only: drop the figure as a ragdoll for `seconds` and report where it lands. */
  ragdoll(id: string, opts: { seconds?: number; floor?: number; velocity?: number[]; gravity?: number[] } = {}) {
    const e = this.get(id);
    if (e.dims !== 2) throw new Error("Ragdoll physics is 2D only for now.");
    const fig = e.figure as Figure;
    const lowest = Math.max(...fig.nodes.map((n) => n.worldPosition.y));
    const r = new Ragdoll(fig, {
      bounds: { floor: opts.floor ?? lowest + 4 },
      ...(opts.gravity ? { gravity: { x: opts.gravity[0] ?? 0, y: opts.gravity[1] ?? 1800 } } : {}),
    });
    r.start({ x: opts.velocity?.[0] ?? 0, y: opts.velocity?.[1] ?? 0 });
    // A symmetric figure can balance forever; a tiny nudge tips it over.
    r.impulse({ x: 40, y: 0 }, fig.has("head") ? fig.node("head") : undefined);
    const steps = Math.round((opts.seconds ?? 2) * 120);
    for (let i = 0; i < steps; i++) r.step(1 / 120);
    r.stop();
    return this.describe(id);
  }

  render(id: string, opts: SvgOptions = {}): string {
    return figureToSvg(this.get(id).figure, opts);
  }

  /** The rig with the current pose baked in as rest values, ready to save as JSON. */
  exportRig(id: string): Rig | Rig3D {
    const e = this.get(id);
    const nodes = e.figure.nodes.map((n) => {
      const def = e.rig.nodes.find((d) => d.name === n.name) ?? { name: n.name };
      const out: Record<string, unknown> = { ...def };
      for (const c of this.#channels(e)) {
        const v = (n as unknown as Record<Channel, number>)[c];
        if (Math.abs(v) > 1e-9) out[c] = round(v, 6); else delete out[c];
      }
      return out;
    });
    return { ...e.rig, nodes } as unknown as Rig | Rig3D;
  }
}

function limitFor(e: Entry, node: Record<string, unknown> & { limits?: unknown }, c: Channel): readonly [number, number] | null {
  if (e.dims === 2) return c === "rotation" ? ((node.limits as [number, number] | null) ?? null) : null;
  const l = node.limits as Record<string, [number, number]> | null;
  if (!l || !c.startsWith("r") || c.length !== 2) return null;
  return l[c[1]!] ?? null;
}
