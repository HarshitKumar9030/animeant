import { describe, expect, it } from "vitest";
import { Node } from "../src";

const arm = () => {
  const shoulder = new Node({ name: "shoulder", x: 100, y: 100 });
  const elbow = new Node({ name: "elbow", x: 50 });
  const hand = new Node({ name: "hand", x: 40 });
  shoulder.add(elbow);
  elbow.add(hand);
  return { shoulder, elbow, hand };
};

describe("Node forward kinematics", () => {
  it("chains offsets", () => {
    const { hand } = arm();
    expect(hand.worldPosition.x).toBeCloseTo(190);
    expect(hand.worldPosition.y).toBeCloseTo(100);
  });

  it("rotating a parent swings the whole chain", () => {
    const { shoulder, elbow, hand } = arm();
    shoulder.rotation = Math.PI / 2;
    expect(elbow.worldPosition.x).toBeCloseTo(100);
    expect(elbow.worldPosition.y).toBeCloseTo(150);
    expect(hand.worldPosition.y).toBeCloseTo(190);
    expect(hand.worldRotation).toBeCloseTo(Math.PI / 2);
  });

  it("accumulates rotations down the chain", () => {
    const { shoulder, elbow, hand } = arm();
    shoulder.rotation = Math.PI / 2;
    elbow.rotation = -Math.PI / 2;
    expect(hand.worldPosition.x).toBeCloseTo(140);
    expect(hand.worldPosition.y).toBeCloseTo(150);
  });

  it("marks descendants dirty and recomputes lazily", () => {
    const { shoulder, hand } = arm();
    hand.worldMatrix;
    expect(hand.isDirty).toBe(false);
    shoulder.x = 0;
    expect(hand.isDirty).toBe(true);
    expect(hand.worldPosition.x).toBeCloseTo(90);
    expect(hand.isDirty).toBe(false);
  });

  it("does not dirty on no-op writes", () => {
    const { shoulder, hand } = arm();
    hand.worldMatrix;
    shoulder.x = 100;
    expect(hand.isDirty).toBe(false);
  });

  it("reparenting moves the subtree", () => {
    const { shoulder, elbow, hand } = arm();
    const other = new Node({ name: "other", x: 0, y: 0 });
    other.add(elbow);
    expect(shoulder.children).not.toContain(elbow);
    expect(hand.worldPosition.x).toBeCloseTo(90);
  });

  it("refuses cycles", () => {
    const { shoulder, hand } = arm();
    expect(() => hand.add(shoulder)).toThrow(/cycle/);
  });

  it("converts world points into parent space", () => {
    const { shoulder, elbow } = arm();
    shoulder.rotation = Math.PI / 2;
    const local = elbow.worldToParent({ x: 100, y: 150 });
    expect(local.x).toBeCloseTo(50);
    expect(local.y).toBeCloseTo(0);
  });
});

describe("Node limits", () => {
  it("clamps rotation into its range", () => {
    const n = new Node({ name: "elbow", limits: [-1, 0.5] });
    n.rotation = 2;
    expect(n.constrain()).toBe(true);
    expect(n.rotation).toBe(0.5);
    expect(n.constrain()).toBe(false);
  });

  it("rejects inverted limits", () => {
    expect(() => new Node({ name: "x", limits: [1, -1] })).toThrow(/min > max/);
  });
});
