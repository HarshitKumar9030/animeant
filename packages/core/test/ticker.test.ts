import { describe, expect, it } from "vitest";
import { Ticker } from "../src";

describe("Ticker", () => {
  it("runs whole fixed steps and carries the remainder", () => {
    const t = new Ticker({ fixedStep: 0.01 });
    let fixed = 0;
    let alpha = -1;
    t.onFixed(() => fixed++);
    t.onFrame((_, a) => (alpha = a));
    expect(t.advance(0.025)).toBe(2);
    expect(alpha).toBeCloseTo(0.5);
    expect(t.advance(0.005)).toBe(1);
    expect(fixed).toBe(3);
    expect(t.time).toBeCloseTo(0.03);
  });

  it("caps steps after a long stall", () => {
    const t = new Ticker({ fixedStep: 0.01, maxSteps: 4 });
    expect(t.advance(10)).toBe(4);
  });

  it("is deterministic regardless of frame slicing", () => {
    const run = (frames: number[]) => {
      const t = new Ticker({ fixedStep: 1 / 60 });
      let x = 0;
      t.onFixed((dt) => (x += dt * 3));
      frames.forEach((f) => t.advance(f));
      return x;
    };
    expect(run([0.05, 0.05])).toBeCloseTo(run([0.02, 0.03, 0.05]));
  });

  it("unsubscribes", () => {
    const t = new Ticker({ fixedStep: 0.01 });
    let n = 0;
    const off = t.onFixed(() => n++);
    t.advance(0.01);
    off();
    t.advance(0.01);
    expect(n).toBe(1);
  });
});
