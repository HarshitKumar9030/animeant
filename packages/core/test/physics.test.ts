import { describe, expect, it } from "vitest";
import { Figure, Node, Ragdoll, SpringChain, distance, humanoid } from "../src";

const rope = () => {
  const a = new Node({ name: "a", x: 100, y: 100 });
  const b = new Node({ name: "b", x: 20 });
  const c = new Node({ name: "c", x: 20 });
  const d = new Node({ name: "d", x: 20 });
  a.add(b); b.add(c); c.add(d);
  return { a, b, c, d };
};

const run = (fn: () => void, steps: number) => { for (let i = 0; i < steps; i++) fn(); };

describe("SpringChain", () => {
  it("hangs straight under gravity with no stiffness, keeping lengths", () => {
    const { a, b, c, d } = rope();
    const s = new SpringChain([a, b, c, d], { stiffness: 0, gravity: { x: 0, y: 900 } });
    run(() => s.step(1 / 120), 1200);
    // Hanging straight down from (100, 100): tip near y = 160.
    expect(d.worldPosition.y).toBeGreaterThan(155);
    expect(d.worldPosition.x).toBeCloseTo(100, 0);
    expect(distance(b.worldPosition, c.worldPosition)).toBeCloseTo(20, 3);
  });

  it("springs back to the driven pose without gravity", () => {
    const { a, b, c, d } = rope();
    const s = new SpringChain([a, b, c, d], { stiffness: 0.2, gravity: { x: 0, y: 0 } });
    // Fling it, then let it settle.
    a.rotation = 0;
    s.step(1 / 120);
    b.rotation = 1.2; // someone else poses a joint
    run(() => s.step(1 / 120), 600);
    expect(b.rotation).toBeCloseTo(1.2, 2);
  });

  it("lags behind when its base moves", () => {
    const { a, b, c, d } = rope();
    const s = new SpringChain([a, b, c, d], { stiffness: 0.05, gravity: { x: 0, y: 0 } });
    a.y += 40;
    s.step(1 / 120);
    // The tip should trail: still above where a rigid chain would be.
    expect(d.worldPosition.y).toBeLessThan(140);
  });
});

describe("Ragdoll", () => {
  const setup = () => {
    const fig = Figure.fromRig(humanoid);
    fig.root.x = 200;
    fig.root.y = 200;
    const rd = new Ragdoll(fig, { bounds: { floor: 400, left: 0, right: 600 } });
    return { fig, rd };
  };

  it("falls and comes to rest on the floor", () => {
    const { fig, rd } = setup();
    rd.start();
    // A perfectly symmetric figure dropped straight down can balance; nudge it.
    rd.impulse({ x: 250, y: 0 }, fig.node("head"));
    run(() => rd.step(1 / 120), 900);
    for (const n of fig.nodes) expect(n.worldPosition.y).toBeLessThanOrEqual(400 + 0.5);
    expect(fig.root.y).toBeGreaterThan(340);
  });

  it("keeps bone lengths exact and joints within limits", () => {
    const { fig, rd } = setup();
    const before = [...fig.bones()].map(([a, b]) => distance(a.worldPosition, b.worldPosition));
    rd.start({ x: 400, y: -300 });
    run(() => rd.step(1 / 120), 300);
    [...fig.bones()].forEach(([a, b], i) => expect(distance(a.worldPosition, b.worldPosition)).toBeCloseTo(before[i]!, 2));
    for (const n of fig.nodes) {
      if (!n.limits) continue;
      expect(n.rotation).toBeGreaterThanOrEqual(n.limits[0] - 1e-6);
      expect(n.rotation).toBeLessThanOrEqual(n.limits[1] + 1e-6);
    }
  });

  it("hangs from a grabbed node and keeps fling velocity on release", () => {
    const { fig, rd } = setup();
    rd.start();
    const hand = fig.node("handR");
    // Grab where the hand is and drag up like a real pointer would.
    const from = hand.worldPosition;
    rd.grab(hand, from);
    for (let i = 1; i <= 60; i++) {
      rd.drag({ x: from.x + ((300 - from.x) * i) / 60, y: from.y + ((100 - from.y) * i) / 60 });
      rd.step(1 / 120);
    }
    run(() => rd.step(1 / 120), 600);
    expect(distance(hand.worldPosition, { x: 300, y: 100 })).toBeLessThan(1);
    // Hangs below the hand, upright, and has stopped moving (no energy pumping).
    expect(fig.root.y - hand.worldPosition.y).toBeGreaterThan(150);
    expect(Math.abs(fig.root.rotation)).toBeLessThan(0.5);
    const settled = { x: fig.root.x, y: fig.root.y, r: fig.root.rotation };
    run(() => rd.step(1 / 120), 120);
    expect(Math.abs(fig.root.x - settled.x)).toBeLessThan(10); // a gentle pendulum sway, not runaway
    expect(Math.abs(fig.root.rotation - settled.r)).toBeLessThan(0.05);
    for (let i = 0; i < 10; i++) { rd.drag({ x: 300 + i * 6, y: 100 }); rd.step(1 / 120); }
    rd.release();
    const x0 = fig.root.x;
    run(() => rd.step(1 / 120), 10);
    expect(fig.root.x).toBeGreaterThan(x0);
  });

  it("does nothing until started", () => {
    const { fig, rd } = setup();
    rd.step(1 / 120);
    expect(fig.root.y).toBe(200);
  });
});
