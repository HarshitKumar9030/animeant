import type { Vec3 } from "./vec3";

/**
 * Unit quaternion stored as [x, y, z, w]. Euler angles use three.js "XYZ"
 * order (intrinsic X, then Y, then Z), in radians.
 */
export type Quat = Float64Array;

export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => Float64Array.of(x, y, z, w);

/** out = a · b (apply b first, then a). Safe when out aliases a or b. */
export const quatMultiply = (out: Quat, a: Quat, b: Quat): Quat => {
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  const bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
};

/** Inverse of a unit quaternion (its conjugate). */
export const quatInvert = (out: Quat, a: Quat): Quat => {
  out[0] = -a[0]!; out[1] = -a[1]!; out[2] = -a[2]!; out[3] = a[3]!;
  return out;
};

export const quatNormalize = (out: Quat, a: Quat): Quat => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!, a[3]!) || 1;
  out[0] = a[0]! / l; out[1] = a[1]! / l; out[2] = a[2]! / l; out[3] = a[3]! / l;
  return out;
};

export const quatFromAxisAngle = (out: Quat, axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  out[0] = axis.x * s; out[1] = axis.y * s; out[2] = axis.z * s; out[3] = Math.cos(angle / 2);
  return out;
};

/** Shortest rotation taking unit vector a onto unit vector b. */
export const quatFromUnitVectors = (out: Quat, a: Vec3, b: Vec3): Quat => {
  let r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
  if (r < 1e-9) {
    // Opposite: any perpendicular axis works.
    r = 0;
    if (Math.abs(a.x) > Math.abs(a.z)) { out[0] = -a.y; out[1] = a.x; out[2] = 0; }
    else { out[0] = 0; out[1] = -a.z; out[2] = a.y; }
  } else {
    out[0] = a.y * b.z - a.z * b.y;
    out[1] = a.z * b.x - a.x * b.z;
    out[2] = a.x * b.y - a.y * b.x;
  }
  out[3] = r;
  return quatNormalize(out, out);
};

export const quatFromEuler = (out: Quat, x: number, y: number, z: number): Quat => {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  out[0] = s1 * c2 * c3 + c1 * s2 * s3;
  out[1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  return out;
};

/** XYZ Euler angles of a unit quaternion. */
export const quatToEuler = (q: Quat): Vec3 => {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.min(1, Math.max(-1, m13)));
  if (Math.abs(m13) < 0.9999999) return { x: Math.atan2(-m23, m33), y: ey, z: Math.atan2(-m12, m11) };
  return { x: Math.atan2(m32, m22), y: ey, z: 0 };
};

export const quatRotate = (q: Quat, v: Vec3): Vec3 => {
  const qx = q[0]!, qy = q[1]!, qz = q[2]!, qw = q[3]!;
  // t = 2 (q × v); v' = v + w t + q × t
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  return {
    x: v.x + qw * tx + qy * tz - qz * ty,
    y: v.y + qw * ty + qz * tx - qx * tz,
    z: v.z + qw * tz + qx * ty - qy * tx,
  };
};

/** Spherical interpolation along the shorter arc. */
export const quatSlerp = (out: Quat, a: Quat, b: Quat, t: number): Quat => {
  let bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  let cos = a[0]! * bx + a[1]! * by + a[2]! * bz + a[3]! * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0 = 1 - t, k1 = t;
  if (cos < 0.9995) {
    const theta = Math.acos(cos);
    const s = Math.sin(theta);
    k0 = Math.sin((1 - t) * theta) / s;
    k1 = Math.sin(t * theta) / s;
  }
  out[0] = a[0]! * k0 + bx * k1;
  out[1] = a[1]! * k0 + by * k1;
  out[2] = a[2]! * k0 + bz * k1;
  out[3] = a[3]! * k0 + bw * k1;
  return quatNormalize(out, out);
};
