import type { Vec2 } from "../math/vec2";
import type { Node } from "../node";

/** -1 when the node's parent space is mirrored, else 1. */
export const handedness = (node: Node): number => {
  const m = node.parent?.worldMatrix;
  return m && m[0]! * m[3]! - m[1]! * m[2]! < 0 ? -1 : 1;
};

/**
 * Rotate `node` so its children best match `targets`: the least-squares
 * rotation about the node (2D Kabsch), atan2(Σ cross, Σ dot) over each
 * child's current offset and wanted offset. Long bones outweigh short
 * stubs, so a chest isn't twisted by a shoulder nudged a few pixels.
 * Children without a target are ignored. Limits apply via `turn`.
 */
export function aimAt(node: Node, targets: (Vec2 | undefined)[]): void {
  const p = node.worldPosition;
  let cross = 0;
  let dot = 0;
  node.children.forEach((child, i) => {
    const t = targets[i];
    if (!t) return;
    const c = child.worldPosition;
    const ax = c.x - p.x, ay = c.y - p.y;
    const bx = t.x - p.x, by = t.y - p.y;
    cross += ax * by - ay * bx;
    dot += ax * bx + ay * by;
  });
  if (Math.hypot(cross, dot) < 1e-9) return;
  node.turn(Math.atan2(cross, dot) * handedness(node));
}
