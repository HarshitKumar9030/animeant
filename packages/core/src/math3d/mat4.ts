import type { Quat } from "./quat";
import type { Vec3 } from "./vec3";

/** 4×4 matrix, column-major like WebGL and three.js. */
export type Mat4 = Float64Array;

export const mat4 = (): Mat4 => {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

/** Translate · Rotate · Scale. */
export const compose = (out: Mat4, p: Vec3, q: Quat, s: Vec3): Mat4 => {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * s.x; out[1] = (xy + wz) * s.x; out[2] = (xz - wy) * s.x; out[3] = 0;
  out[4] = (xy - wz) * s.y; out[5] = (1 - (xx + zz)) * s.y; out[6] = (yz + wx) * s.y; out[7] = 0;
  out[8] = (xz + wy) * s.z; out[9] = (yz - wx) * s.z; out[10] = (1 - (xx + yy)) * s.z; out[11] = 0;
  out[12] = p.x; out[13] = p.y; out[14] = p.z; out[15] = 1;
  return out;
};

const T = new Float64Array(16);

/** out = a · b. Safe when out aliases a or b. */
export const multiply4 = (out: Mat4, a: Mat4, b: Mat4): Mat4 => {
  const t = T;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      t[c * 4 + r] =
        a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  out.set(t);
  return out;
};

export const transformPoint3 = (m: Mat4, p: Vec3): Vec3 => ({
  x: m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!,
  y: m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!,
  z: m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!,
});
