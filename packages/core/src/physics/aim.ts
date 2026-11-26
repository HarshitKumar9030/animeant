import { angleDelta } from "../math/angle";
import type { Vec2 } from "../math/vec2";
import type { Node } from "../node";

/** -1 when the node's parent space is mirrored, else 1. */
export const handedness = (node: Node): number => {
  const m = node.parent?.worldMatrix;
  return m && m[0]! * m[3]! - m[1]! * m[2]! < 0 ? -1 : 1;
};

/**
 * Rotate `node` so its children point at `targets` as closely as one
 * rotation allows: the circular mean of each child's wanted turn. Children without a target are ignored. Then clamp to limits.
 */
export function aimAt(node: Node, targets: (Vec2 | undefined)[]): void {
  const p = node.worldPosition;
  // Circular mean of each child's wanted turn: robust when turns straddle ±π.
  let sx = 0;
  let sy = 0;
  let n = 0;
  node.children.forEach((child, i) => {
    const t = targets[i];
    if (!t) return;
    const c = child.worldPosition;
    if (Math.hypot(t.x - p.x, t.y - p.y) < 1e-6) return;
    const d = angleDelta(Math.atan2(c.y - p.y, c.x - p.x), Math.atan2(t.y - p.y, t.x - p.x));
    sx += Math.cos(d);
    sy += Math.sin(d);
    n++;
  });
  if (!n) return;
  if (Math.hypot(sx, sy) < 1e-9) return;
  node.rotation += Math.atan2(sy, sx) * handedness(node);
  node.constrain();
}
