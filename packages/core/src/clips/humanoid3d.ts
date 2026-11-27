import type { Clip } from "../anim/clip";

/** Clips for `humanoid3d`. Angles in degrees; see the rig for sign conventions. */
export const idle3d: Clip = {
  name: "idle3d",
  duration: 3,
  loop: true,
  units: "deg",
  tracks: {
    spine: { rx: [[0, 2, "inOutSine"], [1.5, 5, "inOutSine"], [3, 2]] },
    head: { rx: [[0, -2, "inOutSine"], [1.5, 1, "inOutSine"], [3, -2]] },
    shoulderL: { rz: [[0, 6, "inOutSine"], [1.5, 9, "inOutSine"], [3, 6]] },
    shoulderR: { rz: [[0, -6, "inOutSine"], [1.5, -9, "inOutSine"], [3, -6]] },
    elbowL: { rx: [[0, -12]] },
    elbowR: { rx: [[0, -12]] },
  },
};

const swing = (a: number, b: number) => [[0, a, "inOutSine"], [0.5, b, "inOutSine"], [1, a]] as [number, number, "inOutSine"?][];

export const walk3d: Clip = {
  name: "walk3d",
  duration: 1,
  loop: true,
  units: "deg",
  tracks: {
    hips: {
      y: [[0, 0, "inOutSine"], [0.25, 0.03, "inOutSine"], [0.5, 0, "inOutSine"], [0.75, 0.03, "inOutSine"], [1, 0]],
      ry: swing(6, -6),
    },
    spine: { ry: swing(-8, 8), rx: [[0, 4]] },
    hipL: { rx: swing(-28, 22) },
    hipR: { rx: swing(22, -28) },
    kneeL: { rx: [[0, 10, "inOutSine"], [0.3, 8, "inOutSine"], [0.62, 60, "inOutSine"], [0.85, 30, "inOutSine"], [1, 10]] },
    kneeR: { rx: [[0, 60, "inOutSine"], [0.12, 60, "inOutSine"], [0.35, 30, "inOutSine"], [0.5, 10, "inOutSine"], [0.8, 8, "inOutSine"], [1, 60]] },
    shoulderL: { rx: swing(24, -24), rz: [[0, 6]] },
    shoulderR: { rx: swing(-24, 24), rz: [[0, -6]] },
    elbowL: { rx: swing(-15, -40) },
    elbowR: { rx: swing(-40, -15) },
  },
};

export const wave3d: Clip = {
  name: "wave3d",
  duration: 1.2,
  loop: true,
  units: "deg",
  tracks: {
    shoulderR: { rz: [[0, -150]], ry: [[0, -60]] },
    elbowR: { rx: [[0, -30, "inOutSine"], [0.6, -80, "inOutSine"], [1.2, -30]] },
    head: { rz: [[0, -6]] },
  },
};

export const humanoid3dClips = { idle: idle3d, walk: walk3d, wave: wave3d };
