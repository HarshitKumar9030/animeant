export type EaseFn = (t: number) => number;

const { PI, sin, cos, pow, sqrt } = Math;
const c1 = 1.70158;
const c3 = c1 + 1;

export const easings = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  outQuint: (t: number) => 1 - pow(1 - t, 5),
  inSine: (t: number) => 1 - cos((t * PI) / 2),
  outSine: (t: number) => sin((t * PI) / 2),
  inOutSine: (t: number) => -(cos(PI * t) - 1) / 2,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
  outCirc: (t: number) => sqrt(1 - pow(t - 1, 2)),
  outBack: (t: number) => 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2),
  inOutBack: (t: number) => {
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  outElastic: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1,
  /** Hold the start value until the next key. */
  step: (t: number) => (t < 1 ? 0 : 1),
} satisfies Record<string, EaseFn>;

export type EaseName = keyof typeof easings;
export type Ease = EaseName | EaseFn;

export const resolveEase = (e: Ease | undefined): EaseFn =>
  typeof e === "function" ? e : easings[e ?? "linear"] ?? easings.linear;

/** CSS-style cubic-bezier(x1, y1, x2, y2), solved with Newton + bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = x(t) - p;
      if (Math.abs(err) < 1e-6) return y(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = p;
    for (let i = 0; i < 30; i++) {
      const v = x(t);
      if (Math.abs(v - p) < 1e-6) break;
      if (v < p) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
}

/** Frame-rate independent exponential approach toward a target. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
