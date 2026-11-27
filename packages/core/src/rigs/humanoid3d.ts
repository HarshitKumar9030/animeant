import type { Rig3D } from "../three-d/figure3d";

const deg = (d: number) => (d * Math.PI) / 180;
const r = (a: number, b: number) => [deg(a), deg(b)] as const;

/**
 * A 1.7 m humanoid. Units are meters, y is up and the figure faces +z, so
 * its left is +x. Arms and legs hang straight down at rest.
 *
 * Signs, for writing clips: on a limb hanging down, negative rx swings it
 * forward. +rz moves a left limb out to the side, -rz a right one.
 * Elbows bend with negative rx, knees with positive rx. Spine, neck and
 * head bend forward with positive rx.
 */
export const humanoid3d: Rig3D = {
  name: "humanoid3d",
  dimensions: 3,
  nodes: [
    { name: "hips", y: 0.95 },
    { name: "spine", parent: "hips", y: 0.26, limits: { x: r(-30, 70), y: r(-45, 45), z: r(-30, 30) } },
    { name: "neck", parent: "spine", y: 0.24, limits: { x: r(-30, 40), y: r(-30, 30), z: r(-20, 20) } },
    { name: "head", parent: "neck", y: 0.1, limits: { x: r(-40, 40), y: r(-70, 70), z: r(-30, 30) } },

    { name: "shoulderL", parent: "neck", x: 0.18, y: -0.04, limits: { x: r(-180, 50), y: r(-90, 90), z: r(-20, 180) } },
    { name: "elbowL", parent: "shoulderL", y: -0.28, limits: { x: r(-150, 0), y: r(0, 0), z: r(0, 0) } },
    { name: "handL", parent: "elbowL", y: -0.25 },
    { name: "shoulderR", parent: "neck", x: -0.18, y: -0.04, limits: { x: r(-180, 50), y: r(-90, 90), z: r(-180, 20) } },
    { name: "elbowR", parent: "shoulderR", y: -0.28, limits: { x: r(-150, 0), y: r(0, 0), z: r(0, 0) } },
    { name: "handR", parent: "elbowR", y: -0.25 },

    { name: "hipL", parent: "hips", x: 0.1, y: -0.05, limits: { x: r(-120, 35), y: r(-45, 45), z: r(-20, 70) } },
    { name: "kneeL", parent: "hipL", y: -0.42, limits: { x: r(0, 150), y: r(0, 0), z: r(0, 0) } },
    { name: "footL", parent: "kneeL", y: -0.42, limits: { x: r(-45, 45), y: r(-20, 20), z: r(-20, 20) } },
    { name: "toeL", parent: "footL", y: -0.05, z: 0.14 },
    { name: "hipR", parent: "hips", x: -0.1, y: -0.05, limits: { x: r(-120, 35), y: r(-45, 45), z: r(-70, 20) } },
    { name: "kneeR", parent: "hipR", y: -0.42, limits: { x: r(0, 150), y: r(0, 0), z: r(0, 0) } },
    { name: "footR", parent: "kneeR", y: -0.42, limits: { x: r(-45, 45), y: r(-20, 20), z: r(-20, 20) } },
    { name: "toeR", parent: "footR", y: -0.05, z: 0.14 },
  ],
};
