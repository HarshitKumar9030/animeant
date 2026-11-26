import type { Clip, EaseName } from "../index";

/*
 * Clips for the humanoid rig, in degrees. Front view, y down:
 *   shoulderL +  raises the left arm    shoulderR −  raises the right arm
 *   hipL      +  swings the leg out     hipR      −  swings the leg out
 * Rest pose has arms ~25° below horizontal; -60/+60 lets them hang.
 */

const s: EaseName = "inOutSine";

/** Three keys that breathe a value from a to b and back over `d` seconds. */
const swing = (a: number, b: number, d: number, ease: EaseName = s): [number, number, EaseName?][] => [
  [0, a, ease],
  [d / 2, b, ease],
  [d, a],
];

export const idle: Clip = {
  name: "idle",
  duration: 2.6,
  loop: true,
  units: "deg",
  tracks: {
    spine: { rotation: swing(0, 2, 2.6) },
    neck: { rotation: swing(0, -3, 2.6) },
    shoulderL: { rotation: swing(-62, -57, 2.6) },
    shoulderR: { rotation: swing(62, 57, 2.6) },
    elbowL: { rotation: swing(10, 16, 2.6) },
    elbowR: { rotation: swing(-10, -16, 2.6) },
    hips: { y: swing(0, -1.5, 2.6) },
  },
};

/** Right arm only, meant for a layer over another clip. */
export const wave: Clip = {
  name: "wave",
  duration: 1.2,
  loop: true,
  units: "deg",
  tracks: {
    shoulderR: { rotation: swing(-100, -106, 1.2) },
    elbowR: {
      rotation: [
        [0, -35, s],
        [0.3, -85, s],
        [0.6, -35, s],
        [0.9, -85, s],
        [1.2, -35],
      ],
    },
    neck: { rotation: swing(-3, -6, 1.2) },
  },
};

const hop = (d: number, h: number): [number, number, EaseName?][] => [
  [0, 0, "outQuad"],
  [d / 4, -h, "inQuad"],
  [d / 2, 0, "outQuad"],
  [(3 * d) / 4, -h, "inQuad"],
  [d, 0],
];

export const jacks: Clip = {
  name: "jacks",
  duration: 1,
  loop: true,
  units: "deg",
  tracks: {
    shoulderL: { rotation: swing(-60, 106, 1, "inOutQuad") },
    shoulderR: { rotation: swing(60, -106, 1, "inOutQuad") },
    elbowL: { rotation: swing(8, 0, 1) },
    elbowR: { rotation: swing(-8, 0, 1) },
    hipL: { rotation: swing(-3, 22, 1, "inOutQuad") },
    hipR: { rotation: swing(3, -22, 1, "inOutQuad") },
    kneeL: { rotation: [[0, 10, "outQuad"], [0.25, 0, "inQuad"], [0.5, 10, "outQuad"], [0.75, 0, "inQuad"], [1, 10]] },
    kneeR: { rotation: [[0, -10, "outQuad"], [0.25, 0, "inQuad"], [0.5, -10, "outQuad"], [0.75, 0, "inQuad"], [1, -10]] },
    hips: { y: hop(1, 16) },
  },
};

export const dance: Clip = {
  name: "dance",
  duration: 1.6,
  loop: true,
  units: "deg",
  tracks: {
    hips: { x: swing(-12, 12, 1.6), y: hop(1.6, 7) },
    spine: { rotation: swing(8, -8, 1.6) },
    neck: { rotation: swing(-7, 7, 1.6) },
    shoulderL: { rotation: swing(-25, 70, 1.6) },
    elbowL: { rotation: swing(95, 30, 1.6) },
    shoulderR: { rotation: swing(-70, 25, 1.6) },
    elbowR: { rotation: swing(-30, -95, 1.6) },
    hipL: { rotation: swing(5, -3, 1.6) },
    kneeL: { rotation: swing(22, 0, 1.6) },
    hipR: { rotation: swing(3, -5, 1.6) },
    kneeR: { rotation: swing(0, -22, 1.6) },
  },
};

export const humanoidClips = { idle, wave, jacks, dance };
