import type { Rig } from "../figure";

/** A simple upright stick figure. Units are pixels; y points down. */
export const humanoid: Rig = {
  name: "humanoid",
  nodes: [
    { name: "hips" },
    { name: "spine", parent: "hips", y: -60 },
    { name: "neck", parent: "spine", y: -50 },
    { name: "head", parent: "neck", y: -26 },

    { name: "shoulderL", parent: "neck", x: -8 },
    { name: "elbowL", parent: "shoulderL", x: -48, y: 22 },
    { name: "handL", parent: "elbowL", x: -42, y: 22 },
    { name: "shoulderR", parent: "neck", x: 8 },
    { name: "elbowR", parent: "shoulderR", x: 48, y: 22 },
    { name: "handR", parent: "elbowR", x: 42, y: 22 },

    { name: "kneeL", parent: "hips", x: -18, y: 58 },
    { name: "footL", parent: "kneeL", x: -6, y: 56 },
    { name: "kneeR", parent: "hips", x: 18, y: 58 },
    { name: "footR", parent: "kneeR", x: 6, y: 56 },
  ],
};
