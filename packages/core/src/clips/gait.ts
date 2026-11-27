import type { Clip, Key } from "../anim/clip";
import { Figure3D, type Rig3D } from "../three-d/figure3d";

export interface GaitParams {
  name?: string;
  /** Seconds per full cycle (two steps). */
  duration?: number;
  /** Hip swing each way, degrees. */
  stride?: number;
  /** Extra knee bend while the leg swings through, degrees. */
  swingKnee?: number;
  /** Knee bend held through the stance, degrees. Bent-knee walkers crouch. */
  crouch?: number;
  /** Forward lean of the trunk, degrees. With `quadruped`, the whole body pitches. */
  lean?: number;
  /** Arm swing each way, degrees. */
  armSwing?: number;
  /** Base elbow bend, degrees. */
  elbow?: number;
  /** Trunk twist each way, degrees. */
  twist?: number;
  /** Walk on knuckles as well as feet. */
  quadruped?: boolean;
  /** Samples per cycle. Default 24. */
  samples?: number;
}

export interface Gait {
  clip: Clip;
  /**
   * Root height that puts the feet on the ground at the clip's first frame.
   * Root motion is relative to that frame, so set `figure.root.y = height`
   * (then `animator.rebase(figure.root)`) before playing.
   */
  height: number;
  /** Forward speed in m/s that keeps the planted foot from sliding. */
  speed: number;
}

/**
 * Generate a walk cycle for a `hominid` (or `humanoid3d`) rig. Joint angles
 * come from the parameters; the root's height is then solved per sample by
 * running FK on the rig, so the lowest foot (or knuckle) touches the ground,
 * and the speed is measured from the stance foot, so it doesn't slide.
 */
export function hominidGait(rig: Rig3D, g: GaitParams = {}): Gait {
  const T = g.duration ?? 1.1;
  const stride = g.stride ?? 24;
  const swingKnee = g.swingKnee ?? 55;
  const crouch = g.crouch ?? 6;
  const lean = g.lean ?? 4;
  const armSwing = g.armSwing ?? 20;
  const elbow = g.elbow ?? 15;
  const twist = g.twist ?? 6;
  const quad = g.quadruped ?? false;
  const n = g.samples ?? 24;
  const TAU = Math.PI * 2;

  // A smooth bump over the swing half of the cycle (phase 0.5..1 for the left leg).
  const swingBump = (p: number) => {
    const u = (((p - 0.5) % 1) + 1) % 1;
    return u < 0.5 ? Math.sin(Math.PI * (u / 0.5)) ** 2 : 0;
  };

  type Pose = Record<string, Partial<Record<"rx" | "ry" | "rz" | "y", number>>>;
  const poseAt = (p: number): Pose => {
    const leg = (q: number) => {
      const hip = -stride * Math.cos(TAU * q) - (quad ? lean : 0) - crouch * 0.5;
      const knee = crouch + swingKnee * swingBump(q) + 4 * Math.max(0, Math.sin(TAU * q));
      const stance = (((q % 1) + 1) % 1) < 0.5;
      // Keep the planted foot level with the ground; let it trail and lift in the swing.
      const level = -(hip + knee) - (quad ? lean : 0);
      const foot = stance ? level : level * 0.4 + 10 * swingBump(q);
      return { hip, knee, foot };
    };
    const L = leg(p), R = leg(p + 0.5);
    const pose: Pose = {
      hipL: { rx: L.hip }, kneeL: { rx: L.knee }, footL: { rx: L.foot },
      hipR: { rx: R.hip }, kneeR: { rx: R.knee }, footR: { rx: R.foot },
      hips: { ry: -twist * Math.cos(TAU * p), ...(quad ? { rx: lean } : {}) },
      spine: { ry: twist * Math.cos(TAU * p), rx: quad ? 0 : lean * 0.6 },
      neck: { rx: quad ? -lean * 0.45 : lean * 0.25 },
      head: { rx: quad ? -lean * 0.35 : -lean * 0.6 },
    };
    if (quad) {
      // Arms are front legs: diagonal to the legs, straight in stance, folding to swing through.
      const arm = (q: number) => ({
        sh: -lean - stride * 0.9 * Math.cos(TAU * q),
        el: -(8 + 45 * swingBump(q)),
      });
      const AL = arm(p + 0.5), AR = arm(p);
      pose.shoulderL = { rx: AL.sh, rz: 8 }; pose.elbowL = { rx: AL.el };
      pose.shoulderR = { rx: AR.sh, rz: -8 }; pose.elbowR = { rx: AR.el };
    } else {
      pose.shoulderL = { rx: armSwing * Math.cos(TAU * p), rz: 6 };
      pose.shoulderR = { rx: -armSwing * Math.cos(TAU * p), rz: -6 };
      pose.elbowL = { rx: -(elbow + armSwing * 0.4 * (1 + Math.cos(TAU * p)) / 2) };
      pose.elbowR = { rx: -(elbow + armSwing * 0.4 * (1 - Math.cos(TAU * p)) / 2) };
    }
    return pose;
  };

  const fig = Figure3D.fromRig(rig);
  const restY = fig.root.y;
  const rad = (d: number) => (d * Math.PI) / 180;
  const contacts = quad ? ["toeL", "toeR", "footL", "footR", "handL", "handR"] : ["toeL", "toeR", "footL", "footR"];
  const radius = (name: string) => {
    const body = fig.node(name).meta.body as { r?: [number, number] } | undefined;
    return body?.r ? body.r[1] : 0.03;
  };

  const tracks: Clip["tracks"] = {};
  const add = (node: string, ch: string, t: number, v: number) => {
    ((tracks[node] ??= {}) as Record<string, Key[]>)[ch] ??= [];
    ((tracks[node] as Record<string, Key[]>)[ch]!).push([t, v, "linear"]);
  };

  let travelled = 0;
  let prevStance: { name: string; z: number } | null = null;
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const pose = poseAt(p % 1);
    fig.root.y = restY;
    for (const [name, ch] of Object.entries(pose)) {
      const node = fig.node(name);
      for (const [c, v] of Object.entries(ch)) if (c !== "y") (node as unknown as Record<string, number>)[c] = rad(v);
    }
    // Plant: lift or drop the root so the lowest contact touches y = 0.
    let low = Infinity, lowName = "";
    for (const c of contacts) {
      const y = fig.node(c).worldPosition.y - radius(c);
      if (y < low) { low = y; lowName = c; }
    }
    const dy = -low;
    fig.root.y = restY + dy;
    // Speed: how far the planted contact moves back relative to the root.
    const z = fig.node(lowName).worldPosition.z;
    if (prevStance && prevStance.name === lowName && i > 0) travelled += Math.max(0, prevStance.z - z);
    prevStance = { name: lowName, z };
    if (i === n) break;
    const t = p * T;
    add("hips", "y", t, dy);
    for (const [name, ch] of Object.entries(pose)) for (const [c, v] of Object.entries(ch)) add(name, c, t, v!);
  }
  // Root motion is relative to the first frame: start the bob at 0 and report the height.
  const ys = (tracks.hips as Record<string, Key[]>).y!;
  const y0 = ys[0]![1];
  for (const k of ys) k[1] -= y0;
  // Close each loop with its first key.
  for (const node of Object.values(tracks)) {
    for (const keys of Object.values(node as Record<string, Key[]>)) keys.push([T, keys[0]![1], "linear"]);
  }
  return {
    clip: { name: g.name ?? `${rig.name ?? "hominid"}Walk`, duration: T, loop: true, units: "deg", tracks },
    height: restY + y0,
    speed: travelled / T,
  };
}
