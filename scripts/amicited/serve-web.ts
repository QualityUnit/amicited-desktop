// @effect-diagnostics nodeBuiltinImport:off - Standalone Vite process resolves its owning workspace and working directory.
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
const requireWeb = NodeModule.createRequire(
  NodePath.resolve(import.meta.dirname, "../../apps/web/package.json"),
);
process.chdir(NodePath.resolve(import.meta.dirname, "../../apps/web"));
const { createServer } = await import(requireWeb.resolve("vite"));
const server = await createServer({
  server: { host: "127.0.0.1", port: Number(process.env.PORT), strictPort: true },
});
await server.listen();
server.printUrls();
process.once("SIGTERM", () => {
  void server.close().then(() => process.exit());
});
