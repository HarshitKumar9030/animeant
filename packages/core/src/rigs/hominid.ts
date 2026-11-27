import type { Rig3D } from "../three-d/figure3d";

const deg = (d: number) => (d * Math.PI) / 180;
const r = (a: number, b: number) => [deg(a), deg(b)] as const;

export interface HominidParams {
  name: string;
  /** Standing height in meters, top of skull. */
  height: number;
  /** Hip-to-ankle length as a fraction of height. Modern humans ≈ 0.47. */
  legs: number;
  /** Shoulder-to-wrist length as a fraction of height. Modern humans ≈ 0.44. */
  arms: number;
  /** Girth multiplier. 1 = slim modern build. */
  build?: number;
  /** Braincase radii (x, y, z) in meters. */
  skull: [number, number, number];
  /** How far the face juts forward, 0 (flat) to 1 (muzzle). */
  face: number;
  /** Brow ridge, 0 to 1. */
  brow: number;
  skin: string;
  /** Body hair color; omit for bare skin. */
  fur?: string;
  /** Head hair color. */
  hair?: string;
  /** Color of a wrap around the hips, if any. */
  wrap?: string;
}

/**
 * A 3D hominid rig with body shapes, built from proportions. Node names
 * match `humanoid3d`, so every humanoid 3D clip and gait works on any of
 * them. Meters, y up, faces +z.
 */
export function hominid(p: HominidParams): Rig3D {
  const h = p.height;
  const w = (p.build ?? 1) * (h / 1.7) ** 0.6;
  const k = h / 1.7;
  const body = p.fur ?? p.skin;
  const wrap = p.wrap ?? body;

  const footH = 0.055 * k;
  const leg = p.legs * h;
  const thigh = leg * 0.52, shin = leg * 0.48;
  const hipsY = footH + leg + 0.03 * k;
  const skullH = p.skull[1] * 2;
  const headY = h - skullH - 0.02 * k;
  const neckLen = 0.075 * k;
  const neckY = headY - neckLen;
  const trunk = neckY - hipsY;
  const arm = p.arms * h;
  const shoulderX = 0.19 * w;

  // Head layout, in the head node's space: the braincase sits on the neck,
  // features are placed on its surface, the jaw juts forward with `face`.
  const [sx, sy, sz] = p.skull;
  const cy = sy * 1.0, cz = -sz * 0.1;
  const surfaceZ = (x: number, y: number) => cz + sz * Math.sqrt(Math.max(0, 1 - ((y - cy) / sy) ** 2 - (x / sx) ** 2));
  const eyeY = cy - sy * 0.2, eyeX = sx * 0.4;
  const eyeZ = surfaceZ(eyeX, eyeY) - 0.004;
  const jaw: [number, number, number] = [sx * 0.7, sy * 0.5, 0.045 + p.face * 0.04];
  const jawAt: [number, number, number] = [0, cy - sy * 0.62, cz + sz * 0.55 + p.face * 0.035];
  const noseZ = Math.max(eyeZ + 0.012, jawAt[2] + jaw[2] * 0.75);
  const fur = p.fur ?? p.skin;

  return {
    name: p.name,
    dimensions: 3,
    nodes: [
      { name: "hips", y: hipsY, meta: { blobs: [{ r: [0.15 * w, 0.1 * w, 0.105 * w], at: [0, 0.01, -0.005], color: wrap }] } },
      {
        name: "spine", parent: "hips", y: trunk * 0.5, limits: { x: r(-30, 70), y: r(-45, 45), z: r(-30, 30) },
        meta: {
          body: { r: [0.12 * w, 0.115 * w], squash: [1.05, 0.68], color: body },
          // Ribcage: one ellipsoid from the waist to the collarbones.
          blobs: [{ r: [0.16 * w, trunk * 0.33, 0.105 * w], at: [0, trunk * 0.2, 0.005], color: body }],
        },
      },
      {
        name: "neck", parent: "spine", y: trunk * 0.5, limits: { x: r(-30, 40), y: r(-30, 30), z: r(-20, 20) },
        meta: { body: { r: [0.11 * w, 0.075 * w], squash: [1.1, 0.75], color: body } },
      },
      {
        name: "head", parent: "neck", y: neckLen, limits: { x: r(-40, 40), y: r(-70, 70), z: r(-30, 30) },
        meta: {
          body: { r: [0.05 * w, 0.048 * w], color: body },
          blobs: [
            { r: p.skull, at: [0, cy, cz], color: p.fur ? fur : p.skin },
            ...(p.hair ? [{ r: [sx * 1.05, sy * 0.92, sz * 1.03] as [number, number, number], at: [0, cy + sy * 0.16, cz - sz * 0.1] as [number, number, number], color: p.hair }] : []),
            { r: jaw, at: jawAt, color: p.skin },
            ...(p.brow > 0.05 ? [{ r: [sx * 0.8, 0.011 + p.brow * 0.011, 0.018 + p.brow * 0.012] as [number, number, number], at: [0, eyeY + 0.022, surfaceZ(0, eyeY + 0.022) - 0.006] as [number, number, number], color: p.fur ? fur : p.skin }] : []),
            { r: [0.015, 0.019, 0.016], at: [0, eyeY - 0.03, noseZ], color: p.skin, detail: 14 },
            { r: [0.012, 0.012, 0.008], at: [eyeX, eyeY, eyeZ], color: "#f3efe8", detail: 12 },
            { r: [0.012, 0.012, 0.008], at: [-eyeX, eyeY, eyeZ], color: "#f3efe8", detail: 12 },
            { r: [0.0068, 0.0068, 0.005], at: [eyeX, eyeY, eyeZ + 0.006], color: "#1c1410", detail: 10 },
            { r: [0.0068, 0.0068, 0.005], at: [-eyeX, eyeY, eyeZ + 0.006], color: "#1c1410", detail: 10 },
            { r: [0.01, 0.022, 0.015], at: [sx * 0.97, eyeY - 0.01, cz], color: p.skin, detail: 12 },
            { r: [0.01, 0.022, 0.015], at: [-sx * 0.97, eyeY - 0.01, cz], color: p.skin, detail: 12 },
          ],
        },
      },

      { name: "shoulderL", parent: "neck", x: shoulderX, y: -0.045 * k, limits: { x: r(-180, 60), y: r(-90, 90), z: r(-20, 180) }, meta: { body: { r: [0.06 * w, 0.058 * w], color: body } } },
      { name: "elbowL", parent: "shoulderL", y: -arm * 0.53, limits: { x: r(-150, 0), y: r(0, 0), z: r(0, 0) }, meta: { body: { r: [0.05 * w, 0.04 * w], color: body } } },
      { name: "handL", parent: "elbowL", y: -arm * 0.47, meta: { body: { r: [0.04 * w, 0.03 * w], color: body }, blobs: [{ r: [0.022 * w, 0.05 * k, 0.034 * w], at: [0, -0.045 * k, 0.005], color: p.skin }] } },
      { name: "shoulderR", parent: "neck", x: -shoulderX, y: -0.045 * k, limits: { x: r(-180, 60), y: r(-90, 90), z: r(-180, 20) }, meta: { body: { r: [0.06 * w, 0.058 * w], color: body } } },
      { name: "elbowR", parent: "shoulderR", y: -arm * 0.53, limits: { x: r(-150, 0), y: r(0, 0), z: r(0, 0) }, meta: { body: { r: [0.05 * w, 0.04 * w], color: body } } },
      { name: "handR", parent: "elbowR", y: -arm * 0.47, meta: { body: { r: [0.04 * w, 0.03 * w], color: body }, blobs: [{ r: [0.022 * w, 0.05 * k, 0.034 * w], at: [0, -0.045 * k, 0.005], color: p.skin }] } },

      { name: "hipL", parent: "hips", x: 0.095 * w, y: -0.04 * k, limits: { x: r(-120, 35), y: r(-45, 45), z: r(-20, 70) }, meta: { body: { r: [0.1 * w, 0.09 * w], color: wrap } } },
      { name: "kneeL", parent: "hipL", y: -thigh, limits: { x: r(0, 150), y: r(0, 0), z: r(0, 0) }, meta: { body: { r: [0.085 * w, 0.055 * w], color: wrap === body ? body : wrap } } },
      { name: "footL", parent: "kneeL", y: -shin, limits: { x: r(-45, 45), y: r(-20, 20), z: r(-20, 20) }, meta: { body: { r: [0.056 * w, 0.038 * w], color: body } } },
      { name: "toeL", parent: "footL", y: -footH * 0.5, z: 0.15 * k, meta: { body: { r: [0.04 * w, 0.034 * w], squash: [1, 0.62], color: p.skin } } },
      { name: "hipR", parent: "hips", x: -0.095 * w, y: -0.04 * k, limits: { x: r(-120, 35), y: r(-45, 45), z: r(-70, 20) }, meta: { body: { r: [0.1 * w, 0.09 * w], color: wrap } } },
      { name: "kneeR", parent: "hipR", y: -thigh, limits: { x: r(0, 150), y: r(0, 0), z: r(0, 0) }, meta: { body: { r: [0.085 * w, 0.055 * w], color: wrap === body ? body : wrap } } },
      { name: "footR", parent: "kneeR", y: -shin, limits: { x: r(-45, 45), y: r(-20, 20), z: r(-20, 20) }, meta: { body: { r: [0.056 * w, 0.038 * w], color: body } } },
      { name: "toeR", parent: "footR", y: -footH * 0.5, z: 0.15 * k, meta: { body: { r: [0.04 * w, 0.034 * w], squash: [1, 0.62], color: p.skin } } },
    ],
  };
}

/** Five steps along the human line, for demos. Proportions are approximate. */
export const hominids = {
  ape: hominid({ name: "Miocene ape", height: 1.25, legs: 0.36, arms: 0.56, build: 1.25, skull: [0.068, 0.066, 0.075], face: 1, brow: 0.7, skin: "#5a4436", fur: "#2f241d" }),
  australopithecus: hominid({ name: "Australopithecus afarensis", height: 1.1, legs: 0.4, arms: 0.48, build: 1.2, skull: [0.064, 0.066, 0.074], face: 0.85, brow: 0.6, skin: "#6e5240", fur: "#4a3628" }),
  habilis: hominid({ name: "Homo habilis", height: 1.3, legs: 0.43, arms: 0.46, build: 1.08, skull: [0.068, 0.072, 0.082], face: 0.55, brow: 0.5, skin: "#785640", fur: "#5b4331" }),
  erectus: hominid({ name: "Homo erectus", height: 1.7, legs: 0.48, arms: 0.44, build: 1.02, skull: [0.068, 0.07, 0.092], face: 0.35, brow: 0.95, skin: "#6b4630", hair: "#1e1611", wrap: "#7a5b3a" }),
  sapiens: hominid({ name: "Homo sapiens", height: 1.76, legs: 0.47, arms: 0.44, build: 0.96, skull: [0.074, 0.086, 0.096], face: 0.05, brow: 0.12, skin: "#b9805a", hair: "#2a1c13", wrap: "#4f5a63" }),
};
