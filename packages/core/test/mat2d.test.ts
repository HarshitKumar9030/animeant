import { describe, expect, it } from "vitest";
import { mat2d } from "../src";

const close = (m: Float32Array, expected: number[]) =>
  expected.forEach((v, i) => expect(m[i]).toBeCloseTo(v, 5));

describe("mat2d", () => {
  it("builds TRS and transforms points", () => {
    const m = mat2d.fromTRS(new Float32Array(6), 10, 5, Math.PI / 2, 1, 1);
    const p = mat2d.transformPoint(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(6);
  });

  it("multiplies in parent·child order", () => {
    const parent = mat2d.fromTRS(new Float32Array(6), 100, 0, Math.PI / 2, 1, 1);
    const child = mat2d.fromTRS(new Float32Array(6), 10, 0, 0, 1, 1);
    const world = mat2d.multiply(new Float32Array(6), parent, child);
    expect(world[4]).toBeCloseTo(100);
    expect(world[5]).toBeCloseTo(10);
  });

  it("inverts", () => {
    const m = mat2d.fromTRS(new Float32Array(6), 3, -4, 0.7, 2, 0.5);
    const inv = mat2d.invert(new Float32Array(6), m)!;
    close(mat2d.multiply(new Float32Array(6), m, inv), [1, 0, 0, 1, 0, 0]);
  });

  it("returns null for singular matrices", () => {
    const m = mat2d.fromTRS(new Float32Array(6), 0, 0, 0, 0, 1);
    expect(mat2d.invert(new Float32Array(6), m)).toBeNull();
  });
});
