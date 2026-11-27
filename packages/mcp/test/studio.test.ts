import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Studio } from "../src/studio";
import { createServer } from "../src/server";

describe("Studio", () => {
  it("creates 2D and 3D figures from presets", () => {
    const s = new Studio();
    expect(s.create({ id: "a", preset: "humanoid" }).dims).toBe(2);
    const b = s.create({ id: "b", preset: "humanoid3d" });
    expect(b.dims).toBe(3);
    expect(b.nodes.find((n) => n.name === "elbowR")?.limits).toEqual({ rx: [-150, 0], ry: [0, 0], rz: [0, 0] });
  });

  it("sets poses in degrees and reports clamping", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid3d" });
    const r = s.setPose("f", { elbowR: { rx: -60 }, kneeL: { rx: -40 } });
    expect(r.changed[0]!.local.rx).toBeCloseTo(-60, 1);
    expect(r.clampedToLimits).toEqual(["kneeL"]);
  });

  it("solves IK in 3D and reports the chain", () => {
    const s = new Studio();
    const d = s.create({ id: "f", preset: "humanoid3d" });
    const sh = d.nodes.find((n) => n.name === "shoulderR")!.world as { x: number; y: number; z: number };
    const r = s.solveIK("f", "handR", [sh.x, sh.y - 0.2, sh.z + 0.35]);
    expect(r.reached).toBe(true);
    expect(r.chain).toEqual(["shoulderR", "elbowR", "handR"]);
  });

  it("samples layered clips from rest", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid3d" });
    const d = s.sampleClips("f", [{ clip: "walk3d", time: 0.25 }, { clip: "wave3d", time: 0, layer: 1 }]);
    const sh = d.nodes.find((n) => n.name === "shoulderR")!;
    expect(sh.local.rz).toBeCloseTo(-150, 0);
    expect(d.nodes.find((n) => n.name === "hipL")!.local.rx).not.toBe(0);
  });

  it("builds a clip and flags keys past limits", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid3d" });
    const { clip, check } = s.buildClip({
      name: "kick", duration: 1, ease: "inOutSine",
      keys: [{ t: 0, pose: { kneeR: { rx: 0 } } }, { t: 0.5, pose: { kneeR: { rx: 170 } } }, { t: 1, pose: { kneeR: { rx: 0 } } }],
    }, "f");
    expect(clip.tracks.kneeR!.rx).toHaveLength(3);
    expect(check.valid).toBe(true);
    expect(check.warnings.join()).toMatch(/limit/);
  });

  it("rejects clips with unknown nodes or 2D channels on 3D figures", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid3d" });
    const r = s.validateClip({ name: "x", duration: 1, tracks: { tail: { rx: [[0, 1]] }, hipL: { rotation: [[0, 1]] } } }, "f");
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it("drops a 2D ragdoll onto the floor", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid" });
    const d = s.ragdoll("f", { seconds: 3, floor: 200 });
    const ys = d.nodes.map((n) => n.world.y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(120); // lying down, not standing
  });

  it("renders SVG and round-trips an exported rig", () => {
    const s = new Studio();
    s.create({ id: "f", preset: "humanoid3d" });
    s.setPose("f", { shoulderL: { rz: 90 } });
    const svg = s.render("f", { view: "front", markers: [{ x: 0, y: 1, z: 0, label: "target" }] });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("target");
    const rig = s.exportRig("f");
    const copy = s.create({ id: "g", rig });
    expect(copy.nodes.find((n) => n.name === "shoulderL")!.local.rz).toBeCloseTo(90, 1);
  });
});

describe("MCP server", () => {
  it("lists tools and runs a create → solve → render flow over the protocol", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);

    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["create_figure", "solve_ik", "sample_clip", "render_figure", "build_clip"]));

    const created = await client.callTool({ name: "create_figure", arguments: { id: "hero", preset: "humanoid" } });
    expect(JSON.parse((created.content as { text: string }[])[0]!.text).dims).toBe(2);
    const solved = await client.callTool({ name: "solve_ik", arguments: { id: "hero", end: "handR", target: [40, -120] } });
    expect(JSON.parse((solved.content as { text: string }[])[0]!.text).chain).toContain("elbowR");
    const svg = await client.callTool({ name: "render_figure", arguments: { id: "hero" } });
    expect((svg.content as { text: string }[])[0]!.text).toContain("<svg");

    const bad = await client.callTool({ name: "describe_figure", arguments: { id: "nope" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
