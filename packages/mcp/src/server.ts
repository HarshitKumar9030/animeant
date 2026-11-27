import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clip, Rig, Rig3D } from "@animeant/core";
import { CLIPS, RIGS, Studio } from "./studio";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

const channelValues = z.record(z.string(), z.number());
const pose = z.record(z.string(), channelValues).describe(
  'Node name → channel → value. 2D channels: x, y, rotation. 3D: x, y, z, rx, ry, rz. Rotations in degrees. Example: {"elbowR": {"rx": -60}}',
);
const clipSchema = z.object({
  name: z.string(),
  duration: z.number().positive(),
  loop: z.boolean().optional(),
  units: z.enum(["rad", "deg"]).optional(),
  tracks: z.record(z.string(), z.record(z.string(), z.array(z.tuple([z.number(), z.number()]).rest(z.string())))),
}).describe("Clip JSON: tracks[node][channel] = [[time, value, ease?], ...]");
const clipRef = z.union([z.string().describe("Preset clip name"), clipSchema]);
const view = z.enum(["front", "side", "top", "three-quarter"]);

/** Build the Animeant MCP server around a Studio (one per connection). */
export function createServer(studio = new Studio()): McpServer {
  const server = new McpServer(
    { name: "animeant", version: "0.1.0" },
    {
      instructions: [
        "Animeant builds and poses skeletal figures. Typical flow: create_figure → describe_figure → set_pose / solve_ik / sample_clip → render_figure to look at the result.",
        "2D figures use pixels with y down; 3D figures use meters with y up, facing +z. All rotations you send or read are degrees.",
        "To author animation, build_clip turns timed poses into clip JSON and validates it against a figure.",
      ].join("\n"),
    },
  );

  server.registerTool("list_presets", {
    title: "List presets",
    description: "Rig and clip presets available to create_figure and sample_clip.",
    annotations: { readOnlyHint: true },
  }, async () => json({
    rigs: Object.entries(RIGS).map(([name, r]) => ({ name, dims: (r as Rig3D).dimensions === 3 ? 3 : 2, nodes: r.nodes.length })),
    clips: Object.values(CLIPS).map((c) => ({ name: c.name, duration: c.duration, loop: !!c.loop, nodes: Object.keys(c.tracks) })),
    figures: studio.list(),
  }));

  server.registerTool("create_figure", {
    title: "Create figure",
    description: "Create a figure from a preset rig (humanoid, humanoid3d, dog3d, ape, australopithecus, habilis, erectus, sapiens) or your own rig JSON. Returns its nodes.",
    inputSchema: {
      id: z.string().optional().describe("Name for the figure; generated if omitted. Reusing an id replaces it."),
      preset: z.string().optional().describe("humanoid (2D); humanoid3d, dog3d, ape, australopithecus, habilis, erectus, sapiens (3D)"),
      rig: z.object({ name: z.string().optional(), dimensions: z.literal(3).optional(), nodes: z.array(z.record(z.string(), z.unknown())) })
        .optional()
        .describe("Rig JSON: {nodes: [{name, parent?, x, y, (z), rotation | rx/ry/rz (radians), limits?}]}. One node has no parent."),
    },
  }, async ({ id, preset, rig }) => json(studio.create({ id, preset, rig: rig as unknown as Rig | Rig3D | undefined })));

  server.registerTool("describe_figure", {
    title: "Describe figure",
    description: "Every node with its parent, local channels (degrees), world position and limits.",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => json(studio.describe(id)));

  server.registerTool("set_pose", {
    title: "Set pose",
    description: "Set local channels on nodes (forward kinematics). Joint limits are enforced and reported.",
    inputSchema: { id: z.string(), pose, reset: z.boolean().optional().describe("Return to the rest pose first") },
  }, async ({ id, pose, reset }) => json(studio.setPose(id, pose, { reset })));

  server.registerTool("reset_pose", {
    title: "Reset pose",
    description: "Return a figure to its rig's rest pose.",
    inputSchema: { id: z.string() },
  }, async ({ id }) => { studio.reset(id); return json({ ok: true }); });

  server.registerTool("solve_ik", {
    title: "Solve IK",
    description: "Move an end node (hand, foot, head) to a world target by rotating its parents. Bone lengths and limits hold.",
    inputSchema: {
      id: z.string(),
      end: z.string().describe("End effector node, e.g. handR"),
      target: z.array(z.number()).min(2).max(3).describe("[x, y] for 2D, [x, y, z] for 3D, in world units"),
      links: z.number().int().min(1).optional().describe("How many parents to bend. Default 2 (shoulder and elbow)."),
      names: z.array(z.string()).optional().describe("Explicit chain, base first. Overrides end/links."),
      solver: z.enum(["auto", "fabrik", "ccd"]).optional(),
    },
  }, async ({ id, end, target, links, names, solver }) => json(studio.solveIK(id, end, target, { links, names, solver })));

  server.registerTool("sample_clip", {
    title: "Sample clip",
    description: "Pose a figure as clips look at a moment in time, from rest. Stack layers to blend (e.g. walk + wave).",
    inputSchema: {
      id: z.string(),
      layers: z.array(z.object({
        clip: clipRef,
        time: z.number().min(0),
        layer: z.number().int().optional(),
        mode: z.enum(["override", "additive"]).optional(),
        weight: z.number().min(0).max(1).optional(),
      })).min(1),
    },
  }, async ({ id, layers }) => json(studio.sampleClips(id, layers as { clip: string | Clip; time: number }[])));

  server.registerTool("validate_clip", {
    title: "Validate clip",
    description: "Check clip JSON for format errors and, given a figure, unknown nodes, wrong channels and keys past joint limits.",
    inputSchema: { clip: clipSchema, id: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ clip, id }) => json(studio.validateClip(clip as Clip, id)));

  server.registerTool("build_clip", {
    title: "Build clip",
    description: "Turn timed poses into clip JSON (degrees), validated against a figure if given.",
    inputSchema: {
      name: z.string(),
      duration: z.number().positive(),
      loop: z.boolean().optional(),
      ease: z.string().optional().describe("Default ease from each key to the next, e.g. inOutSine"),
      keys: z.array(z.object({ t: z.number().min(0), pose, ease: z.string().optional() })).min(1),
      id: z.string().optional(),
    },
  }, async ({ id, ...spec }) => json(studio.buildClip(spec, id)));

  server.registerTool("simulate_ragdoll", {
    title: "Simulate ragdoll",
    description: "2D only. Let the figure fall as a ragdoll onto a floor and return where every joint lands.",
    inputSchema: {
      id: z.string(),
      seconds: z.number().positive().max(20).optional(),
      floor: z.number().optional().describe("Floor y. Default: just below the lowest joint."),
      velocity: z.array(z.number()).length(2).optional().describe("Starting velocity [vx, vy] in px/s"),
    },
  }, async ({ id, ...opts }) => json(studio.ragdoll(id, opts)));

  server.registerTool("render_figure", {
    title: "Render figure",
    description: "Draw the figure as an SVG. 3D figures are projected from a view. Use markers to show IK targets.",
    inputSchema: {
      id: z.string(),
      view: view.optional(),
      width: z.number().int().min(64).max(2048).optional(),
      height: z.number().int().min(64).max(2048).optional(),
      highlight: z.array(z.string()).optional(),
      markers: z.array(z.object({ x: z.number(), y: z.number(), z: z.number().optional(), label: z.string().optional() })).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ id, ...opts }) => ({
    content: [
      { type: "text" as const, text: studio.render(id, opts) },
    ],
  }));

  server.registerTool("export_rig", {
    title: "Export rig",
    description: "Rig JSON with the current pose baked in as the rest pose (radians), ready to save or load with create_figure.",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => json(studio.exportRig(id)));

  server.registerTool("delete_figure", {
    title: "Delete figure",
    description: "Forget a figure.",
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ id }) => json({ deleted: studio.delete(id) }));

  return server;
}
