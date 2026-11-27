import type { Rig3D, Rig3DNode } from "../three-d/figure3d";

const deg = (d: number) => (d * Math.PI) / 180;
const hinge = (lo: number, hi: number) => ({ x: [deg(lo), deg(hi)] as const, y: [0, 0] as const, z: [0, 0] as const });

const COAT = "#c48a52";
const CREAM = "#f1e7d8";
const DARK = "#6b4426";
const INK = "#1b1714";

/** One side of the dog. s = 1 for left (+x), -1 for right. */
const side = (s: 1 | -1, L: "L" | "R"): Rig3DNode[] => [
  // Front leg: elbow and wrist fold backward (+rx).
  { name: `shoulderF${L}`, parent: "chest", x: 0.075 * s, y: -0.06, z: 0.02, limits: { x: [deg(-80), deg(60)], y: [deg(-15), deg(15)], z: [deg(-20), deg(20)] } },
  { name: `elbowF${L}`, parent: `shoulderF${L}`, y: -0.15, limits: hinge(0, 120), meta: { body: { r: [0.048, 0.036], squash: [0.85, 1] } } },
  { name: `wristF${L}`, parent: `elbowF${L}`, y: -0.14, limits: hinge(-15, 120), meta: { body: { r: [0.032, 0.026], color: CREAM } } },
  { name: `pawF${L}`, parent: `wristF${L}`, y: -0.05, z: 0.03, meta: { body: { r: [0.026, 0.03], color: CREAM } } },
  // Back leg: stifle folds the shin back (+rx), the hock folds the other way.
  { name: `hipB${L}`, parent: "pelvis", x: 0.075 * s, y: -0.03, limits: { x: [deg(-80), deg(60)], y: [deg(-15), deg(15)], z: [deg(-20), deg(20)] } },
  { name: `kneeB${L}`, parent: `hipB${L}`, y: -0.15, z: 0.05, limits: hinge(-20, 120), meta: { body: { r: [0.06, 0.04], squash: [0.8, 1] } } },
  { name: `hockB${L}`, parent: `kneeB${L}`, y: -0.14, z: -0.07, limits: hinge(-120, 20), meta: { body: { r: [0.034, 0.026] } } },
  { name: `pawB${L}`, parent: `hockB${L}`, y: -0.07, z: 0.025, meta: { body: { r: [0.024, 0.028], color: CREAM } } },
  // Floppy ear hanging off the skull.
  { name: `ear${L}`, parent: "head", x: 0.06 * s, y: 0.05, z: -0.005, rz: deg(25 * s), limits: { x: [deg(-50), deg(50)], y: [0, 0], z: [deg(-60), deg(60)] } },
  { name: `earTip${L}`, parent: `ear${L}`, y: -0.1, meta: { body: { r: [0.032, 0.026], squash: [0.3, 1], color: DARK } } },
];

/**
 * A beagle-sized dog, 0.5 m at the shoulder. Meters, y up, faces +z, left
 * is +x. Body shapes live in `meta` for `@animeant/three`'s BodyView.
 *
 * Signs: legs swing forward with negative rx. Front elbows and wrists bend
 * with +rx, back stifles with +rx, hocks with -rx. The tail wags with ry.
 */
export const dog3d: Rig3D = {
  name: "dog3d",
  dimensions: 3,
  nodes: [
    { name: "pelvis", y: 0.42, z: -0.18, meta: { bodyColor: COAT, blobs: [{ r: [0.1, 0.1, 0.11], at: [0, 0.005, -0.01] }] } },
    { name: "spine", parent: "pelvis", y: 0.01, z: 0.18, limits: { x: [deg(-30), deg(30)], y: [deg(-25), deg(25)], z: [deg(-15), deg(15)] }, meta: { body: { r: [0.1, 0.11], squash: [0.92, 1.05] } } },
    {
      name: "chest", parent: "spine", y: 0.01, z: 0.15, limits: { x: [deg(-30), deg(30)], y: [deg(-25), deg(25)], z: [deg(-15), deg(15)] },
      meta: { body: { r: [0.11, 0.115], squash: [0.92, 1.1] }, blobs: [{ r: [0.07, 0.085, 0.07], at: [0, -0.03, 0.04], color: CREAM }] },
    },
    { name: "neck", parent: "chest", y: 0.11, z: 0.09, limits: { x: [deg(-50), deg(40)], y: [deg(-50), deg(50)], z: [deg(-20), deg(20)] }, meta: { body: { r: [0.085, 0.065] } } },
    {
      name: "head", parent: "neck", y: 0.07, z: 0.03, limits: { x: [deg(-40), deg(40)], y: [deg(-40), deg(40)], z: [deg(-25), deg(25)] },
      meta: {
        body: { r: [0.06, 0.06] },
        blobs: [
          { r: [0.072, 0.068, 0.078], at: [0, 0.03, 0.005] },
          { r: [0.046, 0.04, 0.072], at: [0, -0.002, 0.085], color: CREAM },
          { r: [0.022, 0.017, 0.016], at: [0, 0.018, 0.152], color: INK, detail: 14 },
          { r: [0.013, 0.015, 0.01], at: [0.035, 0.05, 0.062], color: INK, detail: 12 },
          { r: [0.013, 0.015, 0.01], at: [-0.035, 0.05, 0.062], color: INK, detail: 12 },
        ],
      },
    },
    ...side(1, "L"),
    ...side(-1, "R"),
    { name: "tail1", parent: "pelvis", y: 0.04, z: -0.1, rx: deg(-35), limits: { x: [deg(-80), deg(40)], y: [deg(-60), deg(60)], z: [deg(-30), deg(30)] } },
    { name: "tail2", parent: "tail1", y: 0.08, limits: { x: [deg(-40), deg(40)], y: [deg(-50), deg(50)], z: [deg(-20), deg(20)] }, meta: { body: { r: [0.028, 0.022] } } },
    { name: "tail3", parent: "tail2", y: 0.08, limits: { x: [deg(-40), deg(40)], y: [deg(-50), deg(50)], z: [deg(-20), deg(20)] }, meta: { body: { r: [0.022, 0.016] } } },
    { name: "tail4", parent: "tail3", y: 0.06, meta: { body: { r: [0.016, 0.01], color: CREAM } } },
  ],
};
