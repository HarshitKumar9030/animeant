# @animeant/mcp

An [MCP](https://modelcontextprotocol.io) server for [Animeant](https://github.com/HarshitKumar9030/animeant). It lets an AI agent build skeletal figures, pose them, solve IK, sample and write animation clips, run a ragdoll and look at the result as SVG.

## Install

Claude Code:

```bash
claude mcp add animeant -- npx -y @animeant/mcp
```

Claude Desktop, Cursor and other clients (`mcpServers` in their config):

```json
{
  "mcpServers": {
    "animeant": { "command": "npx", "args": ["-y", "@animeant/mcp"] }
  }
}
```

From a clone of the repo: `pnpm -C packages/mcp build`, then point the client at `node packages/mcp/dist/index.js`.

## Tools

| Tool | What it does |
|---|---|
| `list_presets` | Rig and clip presets, and the figures you've made |
| `create_figure` | From a preset (`humanoid`, `humanoid3d`) or your own rig JSON |
| `describe_figure` | Every node: parent, local channels, world position, limits |
| `set_pose` | Forward kinematics; limits enforced and reported |
| `reset_pose` | Back to the rig's rest pose |
| `solve_ik` | Put a hand, foot or head on a world target |
| `sample_clip` | Pose from one or more clips at a time, layered |
| `build_clip` | Timed poses → clip JSON, validated |
| `validate_clip` | Format, nodes, channels and joint-limit checks |
| `simulate_ragdoll` | 2D: let the figure fall and report where it lands |
| `render_figure` | SVG of the figure; 3D from front, side, top or three-quarter |
| `export_rig` | Rig JSON with the current pose as rest |
| `delete_figure` | Forget a figure |

All angles going in and out are degrees. 2D figures use pixels with y down; 3D figures use meters with y up, facing +z.

Figures live in memory for the life of the server process.
