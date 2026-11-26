import { describe, expect, it } from "vitest";
import { Animator, Figure, compileClip, sampleTrack, type Clip } from "../src";

const rig = () =>
  Figure.fromRig({ nodes: [{ name: "root" }, { name: "arm", parent: "root", x: 10 }, { name: "leg", parent: "root", y: 10 }] });

const swing: Clip = {
  name: "swing",
  duration: 1,
  loop: true,
  tracks: { arm: { rotation: [[0, 0], [0.5, 1], [1, 0]] } },
};

describe("clip sampling", () => {
  it("interpolates, clamps and eases", () => {
    const c = compileClip({ name: "c", duration: 2, tracks: { a: { x: [[0, 0, "inQuad"], [2, 10]] } } });
    const t = c.tracks[0]!;
    expect(sampleTrack(t, -1)).toBe(0);
    expect(sampleTrack(t, 1)).toBeCloseTo(2.5);
    expect(sampleTrack(t, 5)).toBe(10);
  });

  it("converts degree clips", () => {
    const c = compileClip({ name: "d", duration: 1, units: "deg", tracks: { a: { rotation: [[0, 180]], x: [[0, 180]] } } });
    expect(c.tracks.find((t) => t.channel === "rotation")!.values[0]).toBeCloseTo(Math.PI);
    expect(c.tracks.find((t) => t.channel === "x")!.values[0]).toBe(180);
  });

  it("rejects bad clips", () => {
    expect(() => compileClip({ name: "z", duration: 0, tracks: {} })).toThrow(/duration/);
    expect(() => compileClip({ name: "z", duration: 1, tracks: { a: { skew: [[0, 1]] } as never } })).toThrow(/channel/);
  });
});

describe("Animator", () => {
  it("plays and loops", () => {
    const fig = rig();
    const anim = new Animator(fig);
    anim.play(swing, { fade: 0 });
    anim.update(0.5);
    expect(fig.node("arm").rotation).toBeCloseTo(1);
    anim.update(0.75);
    expect(fig.node("arm").rotation).toBeCloseTo(0.5);
  });

  it("fades in from the current pose", () => {
    const fig = rig();
    fig.node("arm").rotation = 2;
    const anim = new Animator(fig);
    anim.play({ name: "hold", duration: 1, loop: true, tracks: { arm: { rotation: [[0, 0]] } } }, { fade: 1 });
    anim.update(0.5);
    expect(fig.node("arm").rotation).toBeCloseTo(1);
  });

  it("crossfades clips on the same layer", () => {
    const fig = rig();
    const anim = new Animator(fig);
    const a: Clip = { name: "a", duration: 1, loop: true, tracks: { arm: { x: [[0, 100]] } } };
    const b: Clip = { name: "b", duration: 1, loop: true, tracks: { arm: { x: [[0, 200]] } } };
    anim.play(a, { fade: 0 });
    anim.update(0.1);
    anim.play(b, { fade: 1 });
    anim.update(0.5);
    expect(fig.node("arm").x).toBeCloseTo(150);
    anim.update(1);
    expect(fig.node("arm").x).toBeCloseTo(200);
    expect(anim.playbacks).toHaveLength(1);
  });

  it("layers override only the channels they key", () => {
    const fig = rig();
    const anim = new Animator(fig);
    anim.play({ name: "base", duration: 1, loop: true, tracks: { arm: { x: [[0, 50]] }, leg: { y: [[0, 30]] } } }, { fade: 0 });
    anim.play({ name: "top", duration: 1, loop: true, tracks: { arm: { x: [[0, 80]] } } }, { layer: 1, fade: 0 });
    anim.update(0.1);
    expect(fig.node("arm").x).toBeCloseTo(80);
    expect(fig.node("leg").y).toBeCloseTo(30);
  });

  it("additive layers add their change from frame 0", () => {
    const fig = rig();
    const anim = new Animator(fig);
    anim.play({ name: "base", duration: 1, loop: true, tracks: { arm: { rotation: [[0, 1]] } } }, { fade: 0 });
    anim.play(swing, { layer: 1, mode: "additive", fade: 0, weight: 0.5 });
    anim.update(0.5);
    expect(fig.node("arm").rotation).toBeCloseTo(1.5);
  });

  it("one-shots resolve, fade out and return to base", async () => {
    const fig = rig();
    const anim = new Animator(fig);
    const pb = anim.play({ name: "once", duration: 0.5, tracks: { arm: { x: [[0, 10], [0.5, 40]] } } }, { fade: 0.1 });
    let done = false;
    pb.finished.then(() => (done = true));
    for (let i = 0; i < 40; i++) anim.update(0.02);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(anim.active).toBe(false);
    expect(fig.node("arm").x).toBeCloseTo(10);
  });

  it("pause, seek and speed", () => {
    const fig = rig();
    const anim = new Animator(fig);
    const pb = anim.play(swing, { fade: 0, speed: 2 });
    anim.update(0.25);
    expect(fig.node("arm").rotation).toBeCloseTo(1);
    pb.pause().seek(0.25);
    anim.update(1);
    expect(fig.node("arm").rotation).toBeCloseTo(0.5);
  });

  it("rebase lets a host own a channel", () => {
    const fig = rig();
    const anim = new Animator(fig);
    anim.play({ name: "bob", duration: 1, loop: true, tracks: { root: { y: [[0, 0], [1, 0]] } } }, { mode: "additive", fade: 0 });
    fig.root.y = 300;
    anim.rebase(fig.root, "y");
    anim.update(0.1);
    expect(fig.root.y).toBeCloseTo(300);
  });

  it("clear hands the pose over untouched", () => {
    const fig = rig();
    const anim = new Animator(fig);
    anim.play(swing, { fade: 0 });
    anim.update(0.5);
    anim.clear();
    fig.node("arm").rotation = 0.25;
    anim.update(0.1);
    expect(anim.active).toBe(false);
    expect(fig.node("arm").rotation).toBe(0.25);
  });

  it("refuses clips for nodes the figure lacks", () => {
    const anim = new Animator(rig());
    expect(() => anim.play({ name: "x", duration: 1, tracks: { tail: { x: [[0, 1]] } } })).toThrow(/unknown node/);
  });
});
