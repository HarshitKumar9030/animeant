import type { Vec2 } from "./vec2";

/**
 * 2D affine matrix stored as [a, b, c, d, tx, ty]:
 *
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 */
export type Mat2D = Float32Array;

export const identity = (out: Mat2D = new Float32Array(6)): Mat2D => {
  out[0] = 1; out[1] = 0;
  out[2] = 0; out[3] = 1;
  out[4] = 0; out[5] = 0;
  return out;
};

/** Translate · Rotate · Scale, the usual local-transform order. */
export const fromTRS = (
  out: Mat2D,
  x: number,
  y: number,
  rotation: number,
  sx: number,
  sy: number,
): Mat2D => {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  out[0] = cos * sx; out[1] = sin * sx;
  out[2] = -sin * sy; out[3] = cos * sy;
  out[4] = x; out[5] = y;
  return out;
};

/** out = a · b (apply b first, then a). Safe when out aliases a or b. */
export const multiply = (out: Mat2D, a: Mat2D, b: Mat2D): Mat2D => {
  const a0 = a[0]!, a1 = a[1]!, a2 = a[2]!, a3 = a[3]!, a4 = a[4]!, a5 = a[5]!;
  const b0 = b[0]!, b1 = b[1]!, b2 = b[2]!, b3 = b[3]!, b4 = b[4]!, b5 = b[5]!;
  out[0] = a0 * b0 + a2 * b1;
  out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3;
  out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4;
  out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
};

export const copy = (out: Mat2D, a: Mat2D): Mat2D => {
  out.set(a);
  return out;
};

export const invert = (out: Mat2D, a: Mat2D): Mat2D | null => {
  const a0 = a[0]!, a1 = a[1]!, a2 = a[2]!, a3 = a[3]!, a4 = a[4]!, a5 = a[5]!;
  const det = a0 * a3 - a1 * a2;
  if (det === 0) return null;
  const inv = 1 / det;
  out[0] = a3 * inv;
  out[1] = -a1 * inv;
  out[2] = -a2 * inv;
  out[3] = a0 * inv;
  out[4] = (a2 * a5 - a3 * a4) * inv;
  out[5] = (a1 * a4 - a0 * a5) * inv;
  return out;
};

export const transformPoint = (m: Mat2D, p: Vec2): Vec2 => ({
  x: m[0]! * p.x + m[2]! * p.y + m[4]!,
  y: m[1]! * p.x + m[3]! * p.y + m[5]!,
});

/** Rotation encoded in the matrix (ignores skew). */
export const rotationOf = (m: Mat2D): number => Math.atan2(m[1]!, m[0]!);
