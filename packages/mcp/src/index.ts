import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

// The `animeant-mcp` bin: one Studio per process, spoken to over stdio.
const server = createServer();
await server.connect(new StdioServerTransport());
