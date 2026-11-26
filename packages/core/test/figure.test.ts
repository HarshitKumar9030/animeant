import { describe, expect, it } from "vitest";
import { Figure, humanoid } from "../src";

describe("Figure", () => {
  it("builds the humanoid rig", () => {
    const fig = Figure.fromRig(humanoid);
    expect(fig.root.name).toBe("hips");
    expect(fig.nodes).toHaveLength(humanoid.nodes.length);
    expect([...fig.bones()]).toHaveLength(humanoid.nodes.length - 1);
  });

  it("looks nodes up by name", () => {
    const fig = Figure.fromRig(humanoid);
    expect(fig.node("handR").parent?.name).toBe("elbowR");
    expect(() => fig.node("tail")).toThrow(/no node/);
  });

  it("moving the root moves everything", () => {
    const fig = Figure.fromRig(humanoid);
    const before = fig.node("handR").worldPosition;
    fig.root.x += 30;
    expect(fig.node("handR").worldPosition.x).toBeCloseTo(before.x + 30);
  });

  it("saves and restores poses", () => {
    const fig = Figure.fromRig(humanoid);
    const rest = fig.pose();
    fig.node("shoulderR").rotation = 1;
    fig.applyPose(rest);
    expect(fig.node("shoulderR").rotation).toBe(0);
  });

  it("rejects bad rigs", () => {
    expect(() => Figure.fromRig({ nodes: [{ name: "a" }, { name: "b" }] })).toThrow(/one root/);
    expect(() => Figure.fromRig({ nodes: [{ name: "a" }, { name: "b", parent: "x" }] })).toThrow(/unknown parent/);
    expect(() => Figure.fromRig({ nodes: [{ name: "a" }, { name: "a", parent: "a" }] })).toThrow(/duplicate/);
  });
});
