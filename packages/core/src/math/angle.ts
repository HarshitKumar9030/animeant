const TAU = Math.PI * 2;

/** Wrap an angle into (-π, π]. */
export const wrapAngle = (a: number): number => {
  const r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return r === -Math.PI ? Math.PI : r;
};

/** Shortest signed difference from `from` to `to`. */
export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;
