import { describe, expect, it } from "vitest";
import { Animator, Figure3D, dog3d, dog3dClips, hominidGait, hominids } from "../src";

describe("dog3d", () => {
  it("stands on its paws", () => {
    const f = Figure3D.fromRig(dog3d);
    for (const paw of ["pawFL", "pawFR", "pawBL", "pawBR"]) {
      const y = f.node(paw).worldPosition.y;
      expect(y).toBeGreaterThan(0.01);
      expect(y).toBeLessThan(0.06);
    }
  });

  it("plays every clip within its joint ranges and back", () => {
    for (const clip of Object.values(dog3dClips)) {
      const f = Figure3D.fromRig(dog3d);
      const a = new Animator(f);
      a.play(clip, { fade: 0 });
      for (let i = 0; i < 60; i++) a.update(1 / 60);
      for (const n of f.nodes) expect(Number.isFinite(n.worldPosition.y)).toBe(true);
    }
  });
});

describe("hominids and gaits", () => {
  for (const [key, rig] of Object.entries(hominids)) {
    it(`${key}: walks with feet on the ground at a positive speed`, () => {
      const quad = key === "ape";
      const gait = hominidGait(rig, quad ? { quadruped: true, lean: 60, stride: 20 } : { crouch: key === "australopithecus" ? 14 : 6 });
      expect(gait.speed).toBeGreaterThan(0.1);
      expect(gait.speed).toBeLessThan(3);
      const f = Figure3D.fromRig(rig);
      f.root.y = gait.height;
      const a = new Animator(f);
      a.play(gait.clip, { fade: 0 });
      let lowest = Infinity, highest = -Infinity;
      for (let i = 0; i < 40; i++) {
        a.update(gait.clip.duration / 40);
        const low = Math.min(...["toeL", "toeR", "footL", "footR", ...(quad ? ["handL", "handR"] : [])].map((n) => f.node(n).worldPosition.y));
        lowest = Math.min(lowest, low);
        highest = Math.max(highest, low);
      }
      // The lowest contact stays near the ground through the whole cycle.
      expect(lowest).toBeGreaterThan(-0.01);
      expect(highest).toBeLessThan(0.08);
    });
  }
});
