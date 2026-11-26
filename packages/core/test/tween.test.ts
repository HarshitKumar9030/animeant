import { describe, expect, it } from "vitest";
import { Node, Tweens, cubicBezier, easings, damp } from "../src";

describe("easing", () => {
  it("every named ease runs 0 → 1", () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0), name).toBeCloseTo(0, 5);
      expect(fn(1), name).toBeCloseTo(1, 5);
    }
  });

  it("cubicBezier matches linear and css ease-out shapes", () => {
    const lin = cubicBezier(0, 0, 1, 1);
    expect(lin(0.3)).toBeCloseTo(0.3, 4);
    const out = cubicBezier(0.22, 1, 0.36, 1);
    expect(out(0.5)).toBeGreaterThan(0.85);
  });

  it("damp approaches without overshoot", () => {
    let v = 0;
    for (let i = 0; i < 60; i++) v = damp(v, 10, 8, 1 / 60);
    expect(v).toBeGreaterThan(9.9);
    expect(v).toBeLessThanOrEqual(10);
  });
});

describe("Tweens", () => {
  it("tweens a node property to the end and resolves", async () => {
    const tweens = new Tweens();
    const n = new Node({ name: "n" });
    const tw = tweens.to(n, { x: 100 }, { duration: 1, ease: "linear" });
    tweens.update(0.5);
    expect(n.x).toBeCloseTo(50);
    tweens.update(0.6);
    expect(n.x).toBe(100);
    expect(await tw.finished).toBe(true);
    expect(tweens.active).toBe(0);
  });

  it("waits out its delay and reads the start value late", () => {
    const tweens = new Tweens();
    const o = { v: 0 };
    tweens.to(o, { v: 10 }, { duration: 1, delay: 1, ease: "linear" });
    o.v = 5;
    tweens.update(1);
    tweens.update(0.5);
    expect(o.v).toBeCloseTo(7.5);
  });

  it("turns rotations the short way round", () => {
    const tweens = new Tweens();
    const n = new Node({ name: "n", rotation: 3 });
    tweens.to(n, { rotation: -3 }, { duration: 1, ease: "linear" });
    tweens.update(0.5);
    expect(Math.abs(n.rotation)).toBeGreaterThan(3);
  });

  it("a newer tween takes over a key", async () => {
    const tweens = new Tweens();
    const o = { a: 0, b: 0 };
    const first = tweens.to(o, { a: 10, b: 10 }, { duration: 1, ease: "linear" });
    tweens.update(0.5);
    tweens.to(o, { a: -10 }, { duration: 1, ease: "linear" });
    tweens.update(0.5);
    expect(o.b).toBe(10);
    expect(o.a).toBeCloseTo(-2.5);
    expect(await first.finished).toBe(true);
  });

  it("kill cancels", async () => {
    const tweens = new Tweens();
    const o = { a: 0 };
    const tw = tweens.to(o, { a: 10 }, { duration: 1 });
    tweens.kill(o);
    expect(await tw.finished).toBe(false);
    expect(tweens.active).toBe(0);
  });
});
