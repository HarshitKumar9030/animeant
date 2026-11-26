// Playground-only tween helper. The real timeline lands in core in Phase 4.

export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

export interface Tween {
  update(now: number): boolean;
}

export function tween(
  from: number[],
  to: number[],
  duration: number,
  apply: (values: number[]) => void,
  ease = easeOutQuint,
): Tween {
  let start = -1;
  const out = from.slice();
  return {
    update(now) {
      if (start < 0) start = now;
      const t = Math.min(1, (now - start) / duration);
      const k = ease(t);
      for (let i = 0; i < from.length; i++) out[i] = from[i]! + (to[i]! - from[i]!) * k;
      apply(out);
      return t < 1;
    },
  };
}

/** Frame-rate independent exponential approach toward a target. */
export const approach = (current: number, target: number, dt: number, speed = 14) =>
  current + (target - current) * (1 - Math.exp(-speed * dt));
