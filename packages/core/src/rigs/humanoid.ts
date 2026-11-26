import type { Rig } from "../figure";

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * A simple upright stick figure. Units are pixels; y points down, so a
 * positive rotation turns clockwise on screen. Limits are relative to the
 * rest pose below.
 */
export const humanoid: Rig = {
  name: "humanoid",
  nodes: [
    { name: "hips" },
    { name: "spine", parent: "hips", y: -60, limits: [deg(-35), deg(35)] },
    { name: "neck", parent: "spine", y: -50, limits: [deg(-30), deg(30)] },
    { name: "head", parent: "neck", y: -26 },

    // A short ponytail off the back of the head, for secondary motion.
    { name: "hair1", parent: "head", x: -13, y: -12, meta: { boneWidth: 0 } },
    { name: "hair2", parent: "hair1", x: -9, y: 12, limits: [deg(-80), deg(80)], meta: { boneWidth: 3 } },
    { name: "hair3", parent: "hair2", x: -5, y: 13, limits: [deg(-70), deg(70)], meta: { boneWidth: 2.5 } },
    { name: "hair4", parent: "hair3", x: -3, y: 12, limits: [deg(-70), deg(70)], meta: { boneWidth: 2 } },

    { name: "shoulderL", parent: "neck", x: -8, limits: [deg(-130), deg(110)] },
    { name: "elbowL", parent: "shoulderL", x: -48, y: 22, limits: [deg(-10), deg(150)] },
    { name: "handL", parent: "elbowL", x: -42, y: 22 },
    { name: "shoulderR", parent: "neck", x: 8, limits: [deg(-110), deg(130)] },
    { name: "elbowR", parent: "shoulderR", x: 48, y: 22, limits: [deg(-150), deg(10)] },
    { name: "handR", parent: "elbowR", x: 42, y: 22 },

    { name: "hipL", parent: "hips", x: -10, y: 4, limits: [deg(-60), deg(90)] },
    { name: "kneeL", parent: "hipL", x: -8, y: 54, limits: [deg(-5), deg(140)] },
    { name: "footL", parent: "kneeL", x: -6, y: 56 },
    { name: "hipR", parent: "hips", x: 10, y: 4, limits: [deg(-90), deg(60)] },
    { name: "kneeR", parent: "hipR", x: 8, y: 54, limits: [deg(-140), deg(5)] },
    { name: "footR", parent: "kneeR", x: 6, y: 56 },
  ],
};
