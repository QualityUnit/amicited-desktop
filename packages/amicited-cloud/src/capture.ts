import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type CaptureMcpServer = {
  url?: string;
  headers?: { name: string; value: string }[];
  command?: string;
  args?: string[];
  env?: { name: string; value: string }[];
};
export async function connectCaptureAgent(server: CaptureMcpServer) {
  const client = new Client({ name: "capture-agent", version: "1" });
  const transport = server.url
    ? new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
          headers: Object.fromEntries(
            (server.headers ?? []).map(({ name, value }) => [name, value]),
          ),
        },
      })
    : new StdioClientTransport({
        command: server.command!,
        args: server.args ?? [],
        env: Object.fromEntries((server.env ?? []).map(({ name, value }) => [name, value])),
      });
  await client.connect(
    transport as import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
  );
  return client;
}
