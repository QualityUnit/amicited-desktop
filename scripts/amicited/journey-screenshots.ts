/// <reference lib="dom" />
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
        "devReplay",
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
  runner.stdout!.on("data", consume);
  runner.stderr!.on("data", consume);
  web.stdout!.on("data", consume);
  web.stderr!.on("data", consume);
  runner.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error("Dev stack exited: " + code));
  });
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const { url, pairing } = await ready;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(120_000);
  page.on("pageerror", (e) => console.error("BROWSER ERROR", e));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("BROWSER CONSOLE", m.text());
  });
  await page.goto(pairing.replace(new URL(pairing).origin, url));
  const capture = async (name: string) => {
    for (const [theme, width, height] of [
      ["light", 1344, 1016],
      ["dark", 1344, 1016],
      ["light", 1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: NodePath.join(out, `${name}-${theme}-${width}.png`) });
    }
  };
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await page.getByTestId("composer-editor").waitFor();
  await page.getByRole("button", { name: "Connect Claude", exact: true }).waitFor();
  await capture("01-first-launch");
  await page.getByTestId("composer-editor").fill("Plan my next campaign");
  await page.getByRole("button", { name: "Connect Claude", exact: true }).click();
  if (!(await page.getByTestId("composer-editor").innerText()).includes("Plan my next campaign"))
    throw new Error("Connecting lost the typed prompt");
  await page.getByTestId("composer-editor").fill("");
  await page.evaluate(async () => {
    const { serverEnvironment, primaryServerSettingsAtom } = await import(
      String("/src/state/server.ts")
    );
    const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
    const { readPrimaryEnvironmentId } = await import(String("/src/state/environments.ts"));
    const instance = appAtomRegistry.get(primaryServerSettingsAtom).providerInstances.devReplay;
    const result = await serverEnvironment.mutateProviderInstance.run(appAtomRegistry, {
      environmentId: readPrimaryEnvironmentId(),
      input: {
        providerInstanceMutation: {
          operation: "upsert",
          instanceId: "devReplay",
          instance: { ...instance, enabled: true, config: { ...instance.config, enabled: true } },
        },
        patch: {},
      },
    });
    if (result._tag !== "Success") throw new Error("Could not enable the free Replay fixture");
    await serverEnvironment.refreshProviders.run(appAtomRegistry, {
      environmentId: readPrimaryEnvironmentId(),
      input: {},
    });
  });
  await page.waitForFunction(async () => {
    const { primaryServerProvidersAtom } = await import(String("/src/state/server.ts"));
    const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
    return appAtomRegistry
      .get(primaryServerProvidersAtom)
      .some(
        (p: { instanceId: string; enabled: boolean; models: unknown[] }) =>
          p.instanceId === "devReplay" && p.enabled && p.models.length,
      );
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "amicited.brand",
      JSON.stringify({ website: "https://example.com", name: "Example" }),
    ),
  );
  await page.reload();
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await capture("02-empty-chat");
  await page.getByRole("button", { name: "example.com", exact: true }).click();
  await page.getByRole("button", { name: "Save website" }).waitFor();
  await capture("02c-website-popover");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await capture("02d-collapsed-sidebar");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "marketing",
    ),
  );
  await page.locator('[data-state="pending"]').waitFor();
  await capture("03a-mid-stream");
  await page
    .getByRole("article", { name: "Marketing tool result" })
    .waitFor()
    .catch(async (e) => {
      console.error("BEFORE EXPAND", await page.locator("body").innerText());
      await page
        .getByRole("button", { name: /Worked for/ })
        .first()
        .click();
      console.error("EXPANDED", await page.locator("body").innerText());
      await page.screenshot({ path: NodePath.join(out, "journey-error.png") });
      throw e;
    });
  await page.getByText("This is a controlled Replay result", { exact: false }).waitFor();
  await page.getByRole("complementary", { name: "More with AmICited" }).waitFor();
  await capture("03-tool-card-turn");
  const marketingChatUrl = page.url();
  await page.getByRole("button", { name: "Open full result" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await capture("04-full-result");
  await page.getByRole("button", { name: "Back to chat", exact: false }).click();
  await page
    .getByRole("article", { name: "Marketing tool result" })
    .waitFor()
    .catch(async (e) => {
      console.error("BEFORE EXPAND", await page.locator("body").innerText());
      await page
        .getByRole("button", { name: /Worked for/ })
        .first()
        .click();
      console.error("EXPANDED", await page.locator("body").innerText());
      await page.screenshot({ path: NodePath.join(out, "journey-error.png") });
      throw e;
    });
  await page.getByRole("button", { name: "Open full result" }).click();
  await page.getByRole("button", { name: "Ask AI about this", exact: true }).click();
  await page.waitForURL(marketingChatUrl);
  if (!(await page.getByTestId("composer-editor").innerText()).includes("41"))
    throw new Error("Ask AI did not attach the tool result");
  await capture("04b-result-context-chat");
  await page.getByTestId("composer-editor").fill("");
  await page.goto(marketingChatUrl);
  await page.getByRole("article", { name: "Marketing tool result" }).waitFor();
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "marketing",
    ),
  );
  await page
    .getByRole("article", { name: "Marketing tool result" })
    .waitFor()
    .catch(async (e) => {
      console.error("BEFORE EXPAND", await page.locator("body").innerText());
      await page
        .getByRole("button", { name: /Worked for/ })
        .first()
        .click();
      console.error("EXPANDED", await page.locator("body").innerText());
      await page.screenshot({ path: NodePath.join(out, "journey-error.png") });
      throw e;
    });
  await capture("05-chat-list");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await page.locator("[data-chat-provider-model-picker]").click();
  await page.getByRole("option", { name: /Marketing audit/ }).click();
  await page.getByRole("button", { name: "Manage assistant", exact: true }).waitFor();
  await capture("02b-empty-connected");
  for (const [path, name] of [
    ["/tools", "06-tools"],
    ["/marketing-settings", "07-amicited"],
    ["/settings/general", "08-settings"],
  ]) {
    await page.goto(url + path);
    await page.locator(".am-chat-sidebar").waitFor();
    if (path === "/tools")
      await page.getByText("Loading local tools…").waitFor({ state: "hidden" });
    if (path === "/marketing-settings")
      await page.getByRole("button", { name: "Connect with AmICited" }).first().waitFor();
    await capture(name!);
    if (path === "/tools") {
      await page.locator(".am-tool-grid > a").first().hover();
      await capture("06b-tools-hover");
    }
  }
  await page.goto(marketingChatUrl);
  await page.waitForFunction(() => Boolean((window as unknown as { t3dev?: unknown }).t3dev));
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "marketing-failed",
    ),
  );
  await page.getByText("The tool did not return a usable result.", { exact: true }).waitFor();
  await capture("09-failed-tool");
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "marketing-approval",
    ),
  );
  await page.getByText("Waiting for approval", { exact: true }).first().waitFor();
  await capture("10-pending-approval");
  await page
    .getByRole("button", { name: /^(Yes|Approve|Allow once)$/ })
    .last()
    .click();
  await page.getByText("This is a controlled Replay result", { exact: false }).first().waitFor();
  if (process.env.AMICITED_REAL_PROVIDER === "1") {
    await page.evaluate(async () => {
      const { serverEnvironment, primaryServerSettingsAtom } = await import(
        String("/src/state/server.ts")
      );
      const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
      const { readPrimaryEnvironmentId } = await import(String("/src/state/environments.ts"));
      const instance = appAtomRegistry.get(primaryServerSettingsAtom).providerInstances.claudeAgent;
      const result = await serverEnvironment.mutateProviderInstance.run(appAtomRegistry, {
        environmentId: readPrimaryEnvironmentId(),
        input: {
          providerInstanceMutation: {
            operation: "upsert",
            instanceId: "claudeAgent",
            instance: { ...instance, enabled: true, config: { ...instance.config, enabled: true } },
          },
          patch: {},
        },
      });
      if (result._tag !== "Success") throw new Error("Could not enable Claude");
    });
    const cli = async (args: string[]) => {
      const child = NodeChildProcess.spawn(
        process.execPath,
        ["apps/server/src/bin.ts", ...args, "--base-dir", home],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout.on("data", (b) => {
        output += b.toString();
      });
      child.stderr.on("data", (b) => {
        output += b.toString();
      });
      const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
      return { code, output };
    };
    const project = await cli(["project", "add", process.cwd()]);
    await NodeFSP.writeFile(NodePath.join(out, "real-provider-project.txt"), project.output);
    const turn = await cli([
      "thread",
      "start",
      "--provider",
      "claudeAgent",
      "--model",
      "claude-haiku-4-5",
      "--wait",
      "--json",
      process.cwd(),
      "Use marketing_tools_run to run content.readability on this exact text: Our product helps small teams plan useful content. Then tell me the reading level in one sentence. Do not edit any files or call cloud tools.",
    ]);
    await NodeFSP.writeFile(NodePath.join(out, "real-provider-transcript.txt"), turn.output);
    const match = /"threadId"\s*:\s*"([^"]+)"/.exec(turn.output);
    if (match) {
      const environment = await page.evaluate(async () => {
        const m = await import(String("/src/state/environments.ts"));
        return m.readPrimaryEnvironmentId();
      });
      await page.goto(`${url}/${environment}/${match[1]}`);
      await page.getByTestId("composer-editor").waitFor();
      await capture("11-real-haiku-turn");
    }
  }
  await page.evaluate(() => localStorage.setItem("amicited.workspace-mode", "developer"));
  await page.goto(url + "/");
  await page.getByTestId("composer-editor").waitFor();
  await capture("reference-t3-empty-chat");
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "showcase",
    ),
  );
  await page
    .getByRole("button", { name: /^(Yes|Approve|Allow once)$/ })
    .last()
    .click();
  await page.getByText("I added", { exact: false }).first().waitFor();
  const fold = page.getByRole("button", { name: /^Worked for/ });
  if (await fold.count()) await fold.first().click();
  await capture("reference-t3-showcase");
  const fonts = await page.evaluate(async () => {
    const result: Record<string, boolean> = {};
    for (const family of ["Inter", "Geist", "Geist Mono", "Fraunces"])
      result[family] =
        (await document.fonts.load(`14px "${family}"`)).length > 0 &&
        document.fonts.check(`14px "${family}"`);
    return { faces: result, devicePixelRatio };
  });
  await NodeFSP.writeFile(NodePath.join(out, "browser-fonts.json"), JSON.stringify(fonts, null, 2));
  await NodeFSP.rm(NodePath.join(out, "journey-error.png"), { force: true });
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
