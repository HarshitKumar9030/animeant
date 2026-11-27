import { describe, expect, it } from "vitest";
import {
  Animator, Figure3D, Node3D, distance3, humanoid3d, humanoid3dClips, quat, quatFromAxisAngle,
  quatFromEuler, quatMultiply, quatRotate, quatToEuler, quatFromUnitVectors, normalize3,
} from "../src";

const close = (a: number, b: number, p = 6) => expect(a).toBeCloseTo(b, p);

describe("quaternions", () => {
  it("round-trips Euler XYZ", () => {
    const q = quatFromEuler(quat(), 0.3, -0.7, 1.1);
    const e = quatToEuler(q);
    close(e.x, 0.3); close(e.y, -0.7); close(e.z, 1.1);
  });

  it("rotates vectors like an axis-angle", () => {
    const q = quatFromAxisAngle(quat(), { x: 0, y: 0, z: 1 }, Math.PI / 2);
    const v = quatRotate(q, { x: 1, y: 0, z: 0 });
    close(v.x, 0); close(v.y, 1); close(v.z, 0);
  });

  it("finds the rotation between unit vectors, including opposite ones", () => {
    for (const [a, b] of [[{ x: 1, y: 0, z: 0 }, normalize3({ x: 1, y: 2, z: 3 })], [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }]] as const) {
      const v = quatRotate(quatFromUnitVectors(quat(), a, b), a);
      close(v.x, b.x); close(v.y, b.y); close(v.z, b.z);
    }
  });

  it("multiplies so the right side applies first", () => {
    const x = quatFromAxisAngle(quat(), { x: 1, y: 0, z: 0 }, Math.PI / 2);
    const z = quatFromAxisAngle(quat(), { x: 0, y: 0, z: 1 }, Math.PI / 2);
    const v = quatRotate(quatMultiply(quat(), z, x), { x: 0, y: 1, z: 0 });
    // x first: (0,1,0) → (0,0,1); then z leaves it.
    close(v.x, 0); close(v.y, 0); close(v.z, 1);
  });
});

describe("Node3D", () => {
  it("composes world positions through rotated parents", () => {
    const a = new Node3D({ name: "a", y: 1 });
    const b = new Node3D({ name: "b", x: 2 });
    a.add(b);
    a.ry = Math.PI / 2; // +x turns to -z
    const p = b.worldPosition;
    close(p.x, 0); close(p.y, 1); close(p.z, -2);
  });

  it("marks descendants dirty and rebuilds lazily", () => {
    const a = new Node3D({ name: "a" });
    const b = new Node3D({ name: "b", y: 1 });
    a.add(b);
    b.worldMatrix;
    expect(b.isDirty).toBe(false);
    a.rz = 0.5;
    expect(b.isDirty).toBe(true);
  });

  it("keeps single-axis Euler edits exact", () => {
    const n = new Node3D({ name: "n" });
    n.rx = 0.4; n.ry = -0.2; n.rz = 1.3;
    close(n.rx, 0.4); close(n.ry, -0.2); close(n.rz, 1.3);
  });

  it("clamps each axis into its limits", () => {
    const n = new Node3D({ name: "n", limits: { x: [-1, 0], y: [0, 0] } });
    n.setQuaternion(quatFromEuler(quat(), 0.8, 0.5, 0.3));
    expect(n.constrain()).toBe(true);
    close(n.rx, 0, 5); close(n.ry, 0, 5); close(n.rz, 0.3, 5);
  });
});

describe("Figure3D and Chain3D", () => {
  it("loads the humanoid with the hands at shoulder height minus the arm", () => {
    const f = Figure3D.fromRig(humanoid3d);
    expect(f.nodes.length).toBe(humanoid3d.nodes.length);
    const s = f.node("shoulderL").worldPosition, h = f.node("handL").worldPosition;
    close(s.y - h.y, 0.53);
    expect(h.x).toBeGreaterThan(0); // left is +x
  });

  it("reaches a target with exact bone lengths and hinge elbows", () => {
    const f = Figure3D.fromRig(humanoid3d);
    const arm = f.chain("handR");
    const before = arm.lengths;
    const s = arm.base.worldPosition;
    const target = { x: s.x - 0.1, y: s.y - 0.15, z: s.z + 0.35 };
    const res = arm.solve(target);
    expect(res.reached).toBe(true);
    expect(distance3(arm.end.worldPosition, target)).toBeLessThan(0.002);
    arm.lengths.forEach((l, i) => close(l, before[i]!, 6));
    const elbow = f.node("elbowR");
    close(elbow.ry, 0, 4); close(elbow.rz, 0, 4);
    expect(elbow.rx).toBeLessThanOrEqual(1e-9);
  });

  it("bends the knee the right way to bring the foot up", () => {
    const f = Figure3D.fromRig(humanoid3d);
    const leg = f.chain("footL");
    const hip = leg.base.worldPosition;
    leg.solve({ x: hip.x, y: hip.y - 0.55, z: hip.z + 0.25 });
    expect(f.node("kneeL").rx).toBeGreaterThan(0);
  });

  it("solves a free chain with FABRIK", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => new Node3D({ name: `n${i}`, y: i ? 0.2 : 0 }));
    nodes.forEach((n, i) => i && nodes[i - 1]!.add(n));
    const f = new Figure3D(nodes[0]!);
    const c = f.chain(nodes.map((n) => n.name));
    const res = c.solve({ x: 0.4, y: 0.5, z: 0.3 }, { solver: "fabrik" });
    expect(res.reached).toBe(true);
    c.lengths.forEach((l) => close(l, 0.2, 6));
  });

  it("gets as close as it can to an unreachable target", () => {
    const f = Figure3D.fromRig(humanoid3d);
    const arm = f.chain("handL");
    const s = arm.base.worldPosition;
    const res = arm.solve({ x: s.x + 5, y: s.y, z: s.z });
    expect(res.reached).toBe(false);
    close(distance3(arm.end.worldPosition, s), arm.reach, 2);
  });
});

describe("Animator with 3D clips", () => {
  it("plays walk on a Figure3D and returns to rest after fading out", () => {
    const f = Figure3D.fromRig(humanoid3d);
    const a = new Animator(f);
    a.play(humanoid3dClips.walk, { fade: 0 });
    a.update(0.25);
    expect(f.node("hipL").rx).not.toBeCloseTo(0, 3);
    a.stop(undefined, 0.1);
    for (let i = 0; i < 30; i++) a.update(1 / 60);
    close(f.node("hipL").rx, 0, 6);
    close(f.root.y, 0.95, 6);
  });

  it("rejects channels a node doesn't have", () => {
    const f = Figure3D.fromRig(humanoid3d);
    const a = new Animator(f);
    expect(() => a.play({ name: "bad", duration: 1, tracks: { hipL: { rotation: [[0, 1]] } } })).toThrow(/doesn't have/);
  });
});
