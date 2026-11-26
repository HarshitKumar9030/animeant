import type { Figure } from "../figure";
import type { Node } from "../node";
import { compileClip, sampleTrack, type Channel, type Clip, type CompiledClip } from "./clip";

export type BlendMode = "override" | "additive";

export interface PlayOptions {
  /** Higher layers blend over lower ones. Default 0. */
  layer?: number;
  /** Seconds to fade in, and to fade out whatever this replaces on the layer. Default 0.25. */
  fade?: number;
  speed?: number;
  /** Defaults to the clip's own `loop`. */
  loop?: boolean;
  /** "override" blends toward the clip; "additive" adds its change from frame 0. */
  mode?: BlendMode;
  /** Target weight, 0..1. Default 1. */
  weight?: number;
  /** Start time in seconds. */
  from?: number;
  /** Keep the last frame when a one-shot clip ends instead of fading out. */
  hold?: boolean;
}

/** One clip playing on the animator. Returned by `play()`. */
export class Playback {
  readonly clip: Clip;
  readonly compiled: CompiledClip;
  readonly layer: number;
  readonly mode: BlendMode;
  readonly finished: Promise<void>;
  time: number;
  speed: number;
  loop: boolean;
  paused = false;
  weight = 0;
  targetWeight: number;
  fade: number;
  readonly hold: boolean;
  readonly seq: number;
  #resolve!: () => void;
  #ended = false;

  constructor(compiled: CompiledClip, opts: PlayOptions, seq: number) {
    this.clip = compiled.clip;
    this.compiled = compiled;
    this.layer = opts.layer ?? 0;
    this.mode = opts.mode ?? "override";
    this.time = opts.from ?? 0;
    this.speed = opts.speed ?? 1;
    this.loop = opts.loop ?? compiled.clip.loop ?? false;
    this.targetWeight = opts.weight ?? 1;
    this.fade = opts.fade ?? 0.25;
    this.hold = opts.hold ?? false;
    this.seq = seq;
    this.finished = new Promise((r) => (this.#resolve = r));
  }

  get duration(): number { return this.clip.duration; }
  /** 0..1 through the current cycle. */
  get progress(): number { return this.localTime / this.duration; }
  get stopping(): boolean { return this.targetWeight === 0; }

  /** Time within the clip, wrapped when looping. */
  get localTime(): number {
    const d = this.duration;
    if (this.loop) return ((this.time % d) + d) % d;
    return Math.min(Math.max(this.time, 0), d);
  }

  pause(): this { this.paused = true; return this; }
  resume(): this { this.paused = false; return this; }
  seek(t: number): this { this.time = t; return this; }

  /** Fade out and remove. */
  stop(fade = this.fade): this {
    this.targetWeight = 0;
    this.fade = fade;
    return this;
  }

  /** @internal */
  step(dt: number): void {
    if (!this.paused) {
      this.time += dt * this.speed;
      if (!this.loop && !this.#ended && (this.speed >= 0 ? this.time >= this.duration : this.time <= 0)) {
        this.#ended = true;
        this.#resolve();
        if (!this.hold) this.stop();
      }
    }
    const rate = this.fade > 0 ? dt / this.fade : Infinity;
    if (this.weight < this.targetWeight) this.weight = Math.min(this.targetWeight, this.weight + rate);
    else if (this.weight > this.targetWeight) this.weight = Math.max(this.targetWeight, this.weight - rate);
  }

  /** @internal */
  get dead(): boolean { return this.targetWeight === 0 && this.weight === 0; }

  /** @internal */
  endIfLooping(): void { if (this.loop) this.#resolve(); }
}

interface Slot { node: Node; channel: Channel; base: number; }

/**
 * Plays clips on a figure in layers. Every frame each animated channel starts
 * from its base value (the pose when playback began), then each playback
 * blends in, lowest layer first. When the last playback fades out the figure
 * is back at its base pose.
 *
 * Root x/y are always additive (root motion): a clip that bobs the hips moves
 * the figure relative to wherever the host placed it. Hosts that position the
 * root every frame should call `rebase(figure.root)` before `update`.
 */
export class Animator {
  readonly figure: Figure;
  #playbacks: Playback[] = [];
  readonly #slots = new Map<string, Slot>();
  #seq = 0;

  constructor(figure: Figure) {
    this.figure = figure;
  }

  get playbacks(): readonly Playback[] { return this.#playbacks; }
  get active(): boolean { return this.#playbacks.length > 0; }

  /** Start a clip. Fades out anything else playing on the same layer. */
  play(clip: Clip, opts: PlayOptions = {}): Playback {
    const compiled = compileClip(clip);
    for (const t of compiled.tracks) {
      if (!this.figure.has(t.node)) throw new Error(`Animeant: clip "${clip.name}" targets unknown node "${t.node}"`);
    }
    // Starting from rest: take the current pose as the base so nothing jumps.
    if (!this.active) this.rebase();
    const pb = new Playback(compiled, opts, this.#seq++);
    for (const other of this.#playbacks) {
      if (other.layer === pb.layer && !other.stopping) other.stop(pb.fade);
    }
    for (const t of compiled.tracks) this.#slot(t.node, t.channel);
    this.#playbacks.push(pb);
    this.#playbacks.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
    return pb;
  }

  /** Fade out everything, or one layer. */
  stop(layer?: number, fade?: number): void {
    for (const pb of this.#playbacks) if (layer === undefined || pb.layer === layer) pb.stop(fade);
  }

  /**
   * Re-read base values from the figure. With no args, every known channel;
   * call with a node (and channel) when something else owns that value,
   * e.g. a host that positions the root each frame.
   */
  rebase(node?: Node, channel?: Channel): void {
    for (const slot of this.#slots.values()) {
      if (node && slot.node !== node) continue;
      if (channel && slot.channel !== channel) continue;
      slot.base = slot.node[slot.channel];
    }
  }

  #slot(name: string, channel: Channel): Slot {
    const key = `${name}.${channel}`;
    let slot = this.#slots.get(key);
    if (!slot) {
      const node = this.figure.node(name);
      slot = { node, channel, base: node[channel] };
      this.#slots.set(key, slot);
    }
    return slot;
  }

  /** Advance every playback by dt seconds, then write the blended pose. */
  update(dt: number): void {
    if (!this.active) return;
    for (const pb of this.#playbacks) pb.step(dt);
    this.apply();
    const before = this.#playbacks.length;
    this.#playbacks = this.#playbacks.filter((pb) => !pb.dead);
    if (before && !this.#playbacks.length) this.#slots.clear();
  }

  /** Write the blended pose for the current times without advancing. */
  apply(): void {
    const values = new Map<Slot, number>();
    const touched = new Set<Slot>();
    for (const pb of this.#playbacks) {
      for (const t of pb.compiled.tracks) touched.add(this.#slot(t.node, t.channel));
    }
    for (const s of touched) values.set(s, s.base);

    // Playbacks are sorted by layer. Within a layer, override clips are
    // averaged by weight (so a crossfade sums to a full pose) and the result
    // blends over the layers below by the layer's total weight, capped at 1.
    // Additive clips add their change from frame 0, scaled by weight.
    let i = 0;
    const list = this.#playbacks;
    while (i < list.length) {
      const layer = list[i]!.layer;
      const sum = new Map<Slot, { v: number; w: number }>();
      for (; i < list.length && list[i]!.layer === layer; i++) {
        const pb = list[i]!;
        if (pb.weight <= 0) continue;
        const t = pb.localTime;
        for (const track of pb.compiled.tracks) {
          const slot = this.#slot(track.node, track.channel);
          const sample = sampleTrack(track, t);
          // Root translation is always relative to where the host put the figure.
          const rootMotion = slot.node === this.figure.root && (slot.channel === "x" || slot.channel === "y");
          if (pb.mode === "additive" || rootMotion) {
            values.set(slot, values.get(slot)! + (sample - track.values[0]!) * pb.weight);
          } else {
            const acc = sum.get(slot) ?? { v: 0, w: 0 };
            acc.v += sample * pb.weight;
            acc.w += pb.weight;
            sum.set(slot, acc);
          }
        }
      }
      for (const [slot, { v, w }] of sum) {
        const below = values.get(slot)!;
        values.set(slot, below + (v / w - below) * Math.min(1, w));
      }
    }
    for (const [slot, v] of values) slot.node[slot.channel] = v;
  }
}
