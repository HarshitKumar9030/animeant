import { describe, expect, it } from "vitest";
import { Chain, Figure, Node, distance, humanoid, type Solver } from "../src";

const arm = (limits?: [number, number]) => {
  const shoulder = new Node({ name: "shoulder" });
  const elbow = new Node({ name: "elbow", x: 50, limits: limits ?? null });
  const hand = new Node({ name: "hand", x: 40 });
  shoulder.add(elbow);
  elbow.add(hand);
  return { shoulder, elbow, hand, chain: new Chain([shoulder, elbow, hand]) };
};

describe.each<Solver>(["fabrik", "ccd"])("Chain (%s)", (solver) => {
  it("reaches a reachable target", () => {
    const { chain, hand } = arm();
    const target = { x: 40, y: 50 };
    const res = chain.solve(target, { solver, iterations: 40 });
    expect(res.reached).toBe(true);
    expect(distance(hand.worldPosition, target)).toBeLessThan(0.5);
  });

  it("preserves bone lengths", () => {
    const { chain } = arm();
    chain.solve({ x: -30, y: 60 }, { solver, iterations: 40 });
    const [a, b] = chain.lengths;
    expect(a).toBeCloseTo(50, 3);
    expect(b).toBeCloseTo(40, 3);
  });

  it("stretches straight toward an unreachable target", () => {
    const { chain, hand } = arm();
    const res = chain.solve({ x: 0, y: 500 }, { solver, iterations: 40 });
    expect(res.reached).toBe(false);
    expect(hand.worldPosition.x).toBeCloseTo(0, 0);
    expect(hand.worldPosition.y).toBeCloseTo(90, 0);
  });

  it("respects joint limits", () => {
    const { chain, elbow } = arm([0, 0.3]);
    chain.solve({ x: 10, y: -20 }, { solver, iterations: 40 });
    expect(elbow.rotation).toBeGreaterThanOrEqual(0);
    expect(elbow.rotation).toBeLessThanOrEqual(0.3 + 1e-9);
  });
});

describe("Figure.chain", () => {
  it("walks up from the end", () => {
    const fig = Figure.fromRig(humanoid);
    expect(fig.chain("handR").joints.map((j) => j.name)).toEqual(["shoulderR", "elbowR", "handR"]);
    expect(fig.chain("footL").joints.map((j) => j.name)).toEqual(["hipL", "kneeL", "footL"]);
  });

  it("rejects gaps", () => {
    const fig = Figure.fromRig(humanoid);
    expect(() => fig.chain(["shoulderR", "handR"])).toThrow(/not a child/);
  });

  it("solves a humanoid arm without moving the body", () => {
    const fig = Figure.fromRig(humanoid);
    const chest = fig.node("neck").worldPosition;
    const shoulder = fig.node("shoulderR").worldPosition;
    const target = { x: shoulder.x + 40, y: shoulder.y - 50 };
    fig.chain("handR").solve(target, { iterations: 30 });
    expect(distance(fig.node("handR").worldPosition, target)).toBeLessThan(1);
    expect(fig.node("neck").worldPosition).toEqual(chest);
  });
});
