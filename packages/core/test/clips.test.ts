import { describe, expect, it } from "vitest";
import { Animator, Figure, compileClip, humanoid, humanoidClips, sampleTrack } from "../src";

describe("humanoid clips", () => {
  for (const clip of Object.values(humanoidClips)) {
    it(`${clip.name} targets real nodes, stays in limits and loops seamlessly`, () => {
      const fig = Figure.fromRig(humanoid);
      new Animator(fig).play(clip); // throws on unknown nodes
      for (const t of compileClip(clip).tracks) {
        if (clip.loop) expect(sampleTrack(t, 0)).toBeCloseTo(sampleTrack(t, clip.duration), 5);
        const limits = fig.node(t.node).limits;
        if (t.channel !== "rotation" || !limits) continue;
        for (const v of t.values) {
          expect(v, `${clip.name}/${t.node}`).toBeGreaterThanOrEqual(limits[0] - 1e-6);
          expect(v, `${clip.name}/${t.node}`).toBeLessThanOrEqual(limits[1] + 1e-6);
        }
      }
    });
  }

  it("root motion is relative to where the host put the figure", () => {
    const fig = Figure.fromRig(humanoid);
    const anim = new Animator(fig);
    anim.play(humanoidClips.jacks, { fade: 0 });
    fig.root.y = 400;
    anim.rebase(fig.root);
    anim.update(0.25);
    expect(fig.root.y).toBeCloseTo(384);
  });
});
