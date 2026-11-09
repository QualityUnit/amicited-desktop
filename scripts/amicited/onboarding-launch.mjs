// Launch a fresh-install Electron (isolated home), keep it alive, print CDP port.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeNet from "node:net";
const root = process.env.ROOT ?? NodePath.resolve(import.meta.dirname, "../..");
const home = process.env.FRESH_HOME;
if (!home) throw new Error("Set FRESH_HOME to an isolated directory.");
NodeFS.mkdirSync(NodePath.join(home, "state/userdata"), { recursive: true });
async function port() {
  const s = NodeNet.createServer();
  await new Promise((r) => s.listen(0, "localhost", r));
  const v = s.address().port;
  await new Promise((r) => s.close(r));
  return v;
}
const webPort = await port(),
  serverPort = await port(),
  debugPort = Number(process.env.DEBUG_PORT ?? 9333);
const env = {
  ...process.env,
  T3CODE_HOME: NodePath.join(home, "state"),
  T3CODE_PORT_OFFSET: "219",
  T3CODE_PORT: String(serverPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: `http://localhost:${webPort}`,
  T3CODE_DEV_SEED: "0",
  T3CODE_NO_BROWSER: "1",
  T3CODE_SINGLE_ORIGIN_DEV: "1",
  T3CODE_TELEMETRY_ENABLED: "false",
  T3CODE_DEV_REPLAY_CAPTURE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_HTTP_URL;
delete env.VITE_WS_URL;
const web = NodeChildProcess.spawn(process.execPath, ["scripts/amicited/serve-web.ts"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  web.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (String(chunk).includes("Local:")) resolve();
  });
  web.once("exit", (code) => reject(new Error(`Web exited before startup: ${code}`)));
});
const boot = NodePath.join(home, "boot.cjs");
NodeFS.writeFileSync(
  boot,
  `require('node:os').homedir=()=>${JSON.stringify(home)};require(${JSON.stringify(NodePath.join(root, "apps/desktop/dist-electron/main.cjs"))});`,
);
const { ensureElectronRuntime } =
  await import("../../apps/desktop/scripts/ensure-electron-runtime.mjs");
ensureElectronRuntime();
process.env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL;
const { resolveElectronLaunchCommand } =
  await import("../../apps/desktop/scripts/electron-launcher.mjs");
const launch = resolveElectronLaunchCommand();
const exe = launch.electronPath;
const childEnv = process.env.FAKE_HOME
  ? { ...env, HOME: process.env.FAKE_HOME, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" }
  : env;
if (process.env.FAKE_HOME) NodeFS.mkdirSync(process.env.FAKE_HOME, { recursive: true });
const child = NodeChildProcess.spawn(
  exe,
  [
    boot,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${home}/profile`,
    "--force-device-scale-factor=2",
  ],
  { cwd: root, env: childEnv, stdio: ["ignore", "inherit", "inherit"] },
);
console.log(
  `CDP_PORT=${debugPort} WEB=${webPort} SERVER=${serverPort} ELECTRON_PID=${child.pid} WEB_PID=${web.pid}`,
);
const stop = () => {
  child.kill();
  web.kill();
  process.exit();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", () => {
  web.kill();
  process.exit();
});
