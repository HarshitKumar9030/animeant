import { resolveEase, type EaseFn, type EaseName } from "./easing";

export type Channel = "rotation" | "x" | "y" | "scaleX" | "scaleY";
export const CHANNELS: readonly Channel[] = ["rotation", "x", "y", "scaleX", "scaleY"];

/** [time in seconds, value, ease from this key to the next]. */
export type Key = [t: number, v: number, ease?: EaseName];

/**
 * A clip as JSON. Tracks are keyed by node name, then channel.
 *
 * ```json
 * { "name": "wave", "duration": 1.2, "loop": true, "units": "deg",
 *   "tracks": { "shoulderR": { "rotation": [[0, -100, "inOutSine"], [0.6, -120], [1.2, -100]] } } }
 * ```
 */
export interface Clip {
  name: string;
  /** Seconds. */
  duration: number;
  loop?: boolean;
  /** Units for rotation keys. Default "rad". */
  units?: "rad" | "deg";
  tracks: Record<string, Partial<Record<Channel, Key[]>>>;
}

export interface CompiledTrack {
  node: string;
  channel: Channel;
  times: Float32Array;
  values: Float32Array;
  eases: EaseFn[];
}

export interface CompiledClip {
  clip: Clip;
  tracks: CompiledTrack[];
}

const cache = new WeakMap<Clip, CompiledClip>();

/** Validate and pre-sort a clip for fast sampling. Cached per clip object. */
export function compileClip(clip: Clip): CompiledClip {
  const hit = cache.get(clip);
  if (hit) return hit;
  if (!(clip.duration > 0)) throw new Error(`Animeant: clip "${clip.name}" needs a positive duration`);
  const toRad = clip.units === "deg" ? Math.PI / 180 : 1;
  const tracks: CompiledTrack[] = [];
  for (const [node, channels] of Object.entries(clip.tracks)) {
    for (const [channel, keys] of Object.entries(channels) as [Channel, Key[]][]) {
      if (!CHANNELS.includes(channel)) throw new Error(`Animeant: unknown channel "${channel}" on "${node}"`);
      if (!keys.length) continue;
      const sorted = [...keys].sort((a, b) => a[0] - b[0]);
      const k = channel === "rotation" ? toRad : 1;
      tracks.push({
        node,
        channel,
        times: Float32Array.from(sorted, (key) => key[0]),
        values: Float32Array.from(sorted, (key) => key[1] * k),
        eases: sorted.map((key) => resolveEase(key[2])),
      });
    }
  }
  const out = { clip, tracks };
  cache.set(clip, out);
  return out;
}

/** Value of a track at time t (seconds, already wrapped or clamped). */
export function sampleTrack(track: CompiledTrack, t: number): number {
  const { times, values, eases } = track;
  const n = times.length;
  if (n === 1 || t <= times[0]!) return values[0]!;
  if (t >= times[n - 1]!) return values[n - 1]!;
  // Keys per track are few; a linear scan beats binary search in practice.
  let i = 0;
  while (t >= times[i + 1]!) i++;
  const t0 = times[i]!, t1 = times[i + 1]!;
  const u = (t - t0) / (t1 - t0);
  return values[i]! + (values[i + 1]! - values[i]!) * eases[i]!(u);
}
