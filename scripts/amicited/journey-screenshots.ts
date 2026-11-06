// @effect-diagnostics nodeBuiltinImport:off - Standalone browser harness owns its Node processes and temporary files.
// @effect-diagnostics globalTimers:off - Bounds startup readiness outside the Effect runtime.
// @effect-diagnostics globalConsole:off - CLI prints the capture destination.
import * as NodeNet from "node:net";
import * as NodeFS from "node:fs";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { chromium } from "playwright-core";

const out = NodePath.resolve(process.argv[2] ?? ".amicited-shots/wave0");
await NodeFSP.mkdir(out, { recursive: true });
const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "amicited-journey-"));
async function availablePort() {
  const socket = NodeNet.createServer();
  await new Promise<void>((done, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", done);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((done) => socket.close(() => done()));
  return address.port;
}
// Disable installed assistants in this temporary home so captures cannot spend provider usage.
await NodeFSP.mkdir(NodePath.join(home, "userdata"), { recursive: true });
await NodeFSP.writeFile(
  NodePath.join(home, "userdata", "settings.json"),
  JSON.stringify({
    providerInstances: Object.fromEntries(
      [
        "codex",
        "claudeAgent",
        "cursor",
        "grok",
        "opencode",
        "antigravity",
        "kiro",
        "muse",
        "pi",
        "fx",
      ].map((driver) => [driver, { driver, enabled: false }]),
    ),
  }),
);
const serverPort = await availablePort();
const webPort = await availablePort();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  T3CODE_HOME: home,
  T3CODE_PORT: String(serverPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: "http://127.0.0.1:" + webPort,
  T3CODE_SINGLE_ORIGIN_DEV: "1",
  T3CODE_NO_BROWSER: "1",
  T3CODE_TELEMETRY_ENABLED: "false",
  T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "0",
  T3CODE_DEV_SEED: "0",
  T3CODE_PORT_OFFSET: "173",
};
delete env.VITE_HTTP_URL;
delete env.VITE_WS_URL;
delete env.T3_SERVICE_LAUNCHER_CONTEXT;
delete env.T3_BOOT_SERVICE_UNIT;
const runner = NodeChildProcess.spawn(process.execPath, ["apps/server/src/bin.ts"], {
  cwd: NodePath.resolve(import.meta.dirname, "../.."),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
const web = NodeChildProcess.spawn(process.execPath, ["scripts/amicited/serve-web.ts"], {
  cwd: NodePath.resolve(import.meta.dirname, "../.."),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
const ready = new Promise<{ url: string; pairing: string }>((resolveReady, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Dev stack did not become ready. See dev-stack.log")),
    900_000,
  );
  const consume = (chunk: Buffer) => {
    logs += chunk.toString();
    NodeFS.writeFileSync(NodePath.join(out, "dev-stack.log"), logs);
    const port = String(webPort);
    const pairing = /pairingUrl:\s*(https?:\/\/[^\s\x1b]+)/.exec(logs)?.[1];
    if (port && pairing && logs.includes("Local:")) {
      clearTimeout(timeout);
      resolveReady({ url: "http://127.0.0.1:" + port, pairing });
    }
  };
  runner.stdout.on("data", consume);
  runner.stderr.on("data", consume);
  web.stdout.on("data", consume);
  web.stderr.on("data", consume);
  runner.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error("Dev stack exited: " + code));
  });
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const { url, pairing } = await ready;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90_000);
  await page.goto(pairing.replace(new URL(pairing).origin, url));
  await page.getByRole("heading", { name: "What’s your website?" }).waitFor();
  const capture = async (name: string) => {
    for (const [theme, width, height] of [
      ["light", 1440, 900],
      ["dark", 1440, 900],
      ["light", 1280, 800],
      ["dark", 1280, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.style.colorScheme = theme;
      }, theme);
      await page.screenshot({
        path: NodePath.join(out, name + "-" + theme + "-" + width + ".png"),
      });
    }
  };
  await capture("01-first-launch");
  await page.getByRole("textbox", { name: "Website URL" }).fill("https://example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Your AI subscriptions" }).waitFor();
  await capture("02-website-and-ai");
  await page.getByRole("button", { name: "Run my free website check" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await capture("03-first-win");
  await page.getByRole("button", { name: "Go to Home →" }).click();
  await page.getByRole("heading", { name: "What will you grow today?" }).waitFor();
  await capture("04-home");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("heading", { name: "Your marketing toolkit" }).waitFor();
  await capture("05-tools-grid");
  await page.goto(url + "/tools/seo.ssl.check");
  await page.getByRole("textbox", { name: "domain" }).fill("example.com");
  await capture("06-tool-form");
  await page.getByRole("button", { name: "Run check" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await page.getByRole("region", { name: "Tool result" }).scrollIntoViewIfNeeded();
  await capture("06-tool-result");
  await page.goto(url + "/tools/seo.site.audit");
  await page.getByRole("textbox", { name: "url", exact: true }).fill("https://example.com");
  await page.getByRole("button", { name: "Run check" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await page.getByRole("region", { name: "Tool result" }).scrollIntoViewIfNeeded();
  await capture("05-site-audit");
  await page.goto(url + "/tools/ai.visibility.check");
  await page.getByRole("textbox", { name: "brand", exact: true }).fill("Acme");
  await page.getByRole("textbox", { name: "website", exact: true }).fill("https://example.com");
  await page.getByRole("textbox", { name: "category", exact: true }).fill("garden tools");
  await page.getByRole("button", { name: "Run check" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await page.getByRole("region", { name: "Tool result" }).scrollIntoViewIfNeeded();
  await capture("05b-ai-visibility");
  await page.goto(url + "/new");
  await page.getByRole("heading", { name: "New task", exact: true }).waitFor();
  await capture("07-new-task");
  await page
    .getByRole("textbox", { name: "What do you want to get done?" })
    .fill("Draft a short marketing plan");
  await page.getByRole("button", { name: "Start a task", exact: true }).click();

  await page.waitForURL(/\/draft\//);

  await page.goto(url + "/settings/general");
  await page.getByRole("heading", { name: "Your website / brand" }).waitFor();
  await capture("08-settings-general");
  await page.getByRole("switch", { name: "Developer features" }).click();
  await page.getByRole("switch", { name: "Developer features" }).waitFor();
  await capture("09-developer-mode");
  console.log(out);
} finally {
  await browser?.close();
  runner.kill("SIGTERM");
  web.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    if (runner.exitCode !== null) resolveExit();
    else runner.once("exit", () => resolveExit());
  });
  await new Promise<void>((done) => {
    if (web.exitCode !== null) done();
    else web.once("exit", () => done());
  });
  await NodeFSP.writeFile(NodePath.join(out, "dev-stack.log"), logs);
  await NodeFSP.rm(home, { recursive: true, force: true });
}
