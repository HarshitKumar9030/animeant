import type { Clip, Key } from "../anim/clip";

type E = Key[2];
/** Keys over one cycle from a list of [phase 0..1, value], shifted by `offset` of a cycle. */
const cycle = (duration: number, pts: [number, number][], offset = 0, ease: E = "inOutSine"): Key[] => {
  const shifted = pts.map(([p, v]) => [((p + offset) % 1 + 1) % 1, v] as [number, number]).sort((a, b) => a[0] - b[0]);
  // Close the loop: value at 0 and 1 must match, so interpolate across the seam.
  const first = shifted[0]!, last = shifted[shifted.length - 1]!;
  const span = 1 - last[0] + first[0];
  const atZero = first[0] === 0 ? first[1] : span > 0 ? last[1] + (first[1] - last[1]) * ((1 - last[0]) / span) : first[1];
  const keys: [number, number][] = [[0, atZero], ...shifted.filter(([p]) => p > 0 && p < 1), [1, atZero]];
  return keys.map(([p, v]) => [p * duration, v, ease]);
};

const T = 0.56;
// One front leg over a stride: planted and sweeping back, then folding and swinging forward.
const frontShoulder: [number, number][] = [[0, -24], [0.5, 22], [0.75, 0]];
const frontElbow: [number, number][] = [[0, 8], [0.45, 10], [0.68, 75], [0.9, 15]];
const frontWrist: [number, number][] = [[0, 0], [0.45, 5], [0.65, 85], [0.88, 10]];
const backHip: [number, number][] = [[0, -22], [0.5, 22], [0.75, 0]];
const backKnee: [number, number][] = [[0, 15], [0.45, 10], [0.7, 60], [0.92, 20]];
const backHock: [number, number][] = [[0, -15], [0.45, -10], [0.7, -70], [0.92, -20]];

/** A trot: diagonal legs move together. */
export const dogTrot: Clip = {
  name: "dogTrot",
  duration: T,
  loop: true,
  units: "deg",
  tracks: {
    pelvis: { y: cycle(T, [[0, 0], [0.25, 0.014], [0.5, 0], [0.75, 0.014]]) },
    chest: { rx: cycle(T, [[0, 1], [0.25, -2], [0.5, 1], [0.75, -2]]) },
    head: { rx: cycle(T, [[0, 4], [0.25, -2], [0.5, 4], [0.75, -2]]) },
    shoulderFL: { rx: cycle(T, frontShoulder) },
    elbowFL: { rx: cycle(T, frontElbow) },
    wristFL: { rx: cycle(T, frontWrist) },
    hipBR: { rx: cycle(T, backHip) },
    kneeBR: { rx: cycle(T, backKnee) },
    hockBR: { rx: cycle(T, backHock) },
    shoulderFR: { rx: cycle(T, frontShoulder, 0.5) },
    elbowFR: { rx: cycle(T, frontElbow, 0.5) },
    wristFR: { rx: cycle(T, frontWrist, 0.5) },
    hipBL: { rx: cycle(T, backHip, 0.5) },
    kneeBL: { rx: cycle(T, backKnee, 0.5) },
    hockBL: { rx: cycle(T, backHock, 0.5) },
    tail1: { ry: cycle(T, [[0, -22], [0.5, 22]]) },
    tail2: { ry: cycle(T, [[0, -18], [0.5, 18]], 0.12) },
    tail3: { ry: cycle(T, [[0, -14], [0.5, 14]], 0.22) },
    earL: { rx: cycle(T, [[0, -8], [0.5, 10]], 0.1) },
    earR: { rx: cycle(T, [[0, -8], [0.5, 10]], 0.1) },
  },
};

/** Standing, breathing, looking around, tail going. */
export const dogIdle: Clip = {
  name: "dogIdle",
  duration: 4,
  loop: true,
  units: "deg",
  tracks: {
    chest: { y: [[0, 0, "inOutSine"], [1, 0.004, "inOutSine"], [2, 0, "inOutSine"], [3, 0.004, "inOutSine"], [4, 0]] },
    neck: { rx: [[0, 0, "inOutSine"], [1.6, -8, "inOutSine"], [2.6, -8, "inOutSine"], [4, 0]] },
    head: { ry: [[0, 0, "inOutSine"], [0.8, 25, "inOutSine"], [1.8, 25, "inOutSine"], [2.6, -20, "inOutSine"], [3.4, -20, "inOutSine"], [4, 0]], rz: [[0, 0, "inOutSine"], [0.8, 8, "inOutSine"], [2.6, -6, "inOutSine"], [4, 0]] },
    tail1: { ry: [[0, -20, "inOutSine"], [0.25, 20, "inOutSine"], [0.5, -20, "inOutSine"], [0.75, 20, "inOutSine"], [1, -20, "inOutSine"], [1.25, 20, "inOutSine"], [1.5, -20, "inOutSine"], [1.75, 20, "inOutSine"], [2, -20, "inOutSine"], [2.5, 0, "inOutSine"], [3.5, 0, "inOutSine"], [4, -20]] },
    tail2: { ry: [[0, 15, "inOutSine"], [0.25, -15, "inOutSine"], [0.5, 15, "inOutSine"], [0.75, -15, "inOutSine"], [1, 15, "inOutSine"], [1.25, -15, "inOutSine"], [1.5, 15, "inOutSine"], [1.75, -15, "inOutSine"], [2, 15, "inOutSine"], [2.5, 0, "inOutSine"], [3.5, 0, "inOutSine"], [4, 15]] },
    earL: { rz: [[0, 0, "inOutSine"], [0.9, -10, "inOutSine"], [2.6, 6, "inOutSine"], [4, 0]] },
    earR: { rz: [[0, 0, "inOutSine"], [0.9, -6, "inOutSine"], [2.6, 10, "inOutSine"], [4, 0]] },
  },
};

/** Sits down and holds. Play with `hold: true`. */
export const dogSit: Clip = {
  name: "dogSit",
  duration: 0.9,
  units: "deg",
  tracks: {
    pelvis: { rx: [[0, 0, "inOutCubic"], [0.9, -38]], y: [[0, 0, "inOutCubic"], [0.9, -0.16]], z: [[0, 0, "inOutCubic"], [0.9, 0.04]] },
    spine: { rx: [[0, 0, "inOutCubic"], [0.9, -6]] },
    neck: { rx: [[0, 0, "inOutCubic"], [0.9, 20]] },
    head: { rx: [[0, 0, "inOutCubic"], [0.9, 22]] },
    shoulderFL: { rx: [[0, 0, "inOutCubic"], [0.9, 40]] },
    shoulderFR: { rx: [[0, 0, "inOutCubic"], [0.9, 40]] },
    wristFL: { rx: [[0, 0, "inOutCubic"], [0.9, 4]] },
    wristFR: { rx: [[0, 0, "inOutCubic"], [0.9, 4]] },
    hipBL: { rx: [[0, 0, "inOutCubic"], [0.9, -40]] },
    hipBR: { rx: [[0, 0, "inOutCubic"], [0.9, -40]] },
    kneeBL: { rx: [[0, 0, "inOutCubic"], [0.9, 110]] },
    kneeBR: { rx: [[0, 0, "inOutCubic"], [0.9, 110]] },
    hockBL: { rx: [[0, 0, "inOutCubic"], [0.9, -100]] },
    hockBR: { rx: [[0, 0, "inOutCubic"], [0.9, -100]] },
    tail1: { rx: [[0, 0, "inOutCubic"], [0.9, 50]] },
  },
};

export const dog3dClips = { idle: dogIdle, trot: dogTrot, sit: dogSit };
export { cycle as cycleKeys };
