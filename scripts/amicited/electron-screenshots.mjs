import * as NodeChildProcess from "node:child_process";
import * as NodeModule from "node:module";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeNet from "node:net";
const root = NodePath.resolve(import.meta.dirname, "../..");
const requireDesktop = NodeModule.createRequire(NodePath.join(root, "apps/desktop/package.json"));
const { chromium } = requireDesktop("playwright-core");
const out = NodePath.resolve(process.argv[2] ?? ".amicited-shots/r12");
NodeFS.mkdirSync(out, { recursive: true });
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "amicited-native-"));
async function port() {
  const socket = NodeNet.createServer();
  await new Promise((resolve) => socket.listen(0, "localhost", resolve));
  const value = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return value;
}
const webPort = await port(),
  serverPort = await port(),
  debugPort = await port();
const env = {
  ...process.env,
  T3CODE_HOME: process.env.AMICITED_CAPTURE_HOME ?? NodePath.join(home, "state"),
  T3CODE_PORT_OFFSET: "217",
  T3CODE_PORT: String(serverPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: `http://localhost:${webPort}`,
  T3CODE_DEV_SEED: "0",
  T3CODE_NO_BROWSER: "1",
  T3CODE_SINGLE_ORIGIN_DEV: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_HTTP_URL;
delete env.VITE_WS_URL;
NodeFS.mkdirSync(NodePath.join(home, "state/userdata"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(home, "state/userdata/settings.json"),
  JSON.stringify({
    providerInstances: {
      devReplay: {
        driver: "acpRegistry",
        enabled: true,
        displayName: "Replay (dev)",
        config: {
          source: "local",
          commandPath: process.execPath,
          commandArgs: [NodePath.join(root, "apps/server/scripts/dev-replay-agent.ts")],
        },
      },
      ...Object.fromEntries(
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
    },
  }),
);
const web = NodeChildProcess.spawn(process.execPath, ["scripts/amicited/serve-web.ts"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
const webReady = new Promise((resolve, reject) => {
  web.stdout.on("data", (c) => {
    NodeFS.appendFileSync(NodePath.join(out, "electron-web.log"), c);
    if (String(c).includes("Local:")) resolve();
  });
  web.stderr.on("data", (c) => NodeFS.appendFileSync(NodePath.join(out, "electron-web.log"), c));
  web.once("exit", (code) => reject(new Error(`Web exited ${code}`)));
});
const boot = NodePath.join(home, "boot.cjs");
// Desktop resolves macOS profiles from NodeOS.homedir, overriding --user-data-dir.
NodeFS.writeFileSync(
  boot,
  `require('node:os').homedir=()=>${JSON.stringify(home)};require(${JSON.stringify(NodePath.join(root, "apps/desktop/dist-electron/main.cjs"))});require('electron').app.on('web-contents-created',(_,w)=>w.on('did-finish-load',()=>{if(w.getURL().startsWith('t3code-dev:'))console.log('NATIVE_RENDERER_READY')}));`,
);
let child, browser;
try {
  await webReady;
  const executable =
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone evidence launcher selects the installed Electron binary without an Effect runtime.
    NodeOS.platform() === "darwin"
      ? NodePath.join(
          root,
          "apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron",
        )
      : requireDesktop("electron");
  child = NodeChildProcess.spawn(
    executable,
    [
      boot,
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${home}/profile`,
      "--force-device-scale-factor=2",
    ],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise((resolve, reject) => {
    child.stderr.on("data", (c) => {
      NodeFS.appendFileSync(NodePath.join(out, "electron-private.log"), c);
    });
    child.stdout.on("data", (c) => {
      NodeFS.appendFileSync(NodePath.join(out, "electron-private.log"), c);
      if (String(c).includes("NATIVE_RENDERER_READY")) resolve();
    });
    child.once("exit", (code) => reject(new Error(`Electron exited ${code}`)));
  });
  browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`);
  const context = browser.contexts()[0];
  const select = async (page) => {
    await page.waitForURL((url) => url.protocol === "t3code-dev:", { timeout: 120000 });
    return page;
  };
  const page = await Promise.any([
    ...context.pages().map(select),
    context.waitForEvent("page").then(select),
  ]);
  await page.locator("[data-amicited-shell]").first().waitFor({ timeout: 120000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const fonts = await page.evaluate(async () => {
    const values = {};
    for (const family of ["Inter", "Geist", "Geist Mono", "Fraunces"])
      values[family] =
        (await document.fonts.load(`14px "${family}"`)).length > 0 &&
        document.fonts.check(`14px "${family}"`);
    return values;
  });
  NodeFS.writeFileSync(
    NodePath.join(out, "electron-fonts.json"),
    JSON.stringify(
      {
        mounted: true,
        fonts,
        url: page.url(),
        devicePixelRatio: await page.evaluate(() => devicePixelRatio),
        profile: home,
        rootCause:
          "The previous evidence harness used an IPv4 CDP endpoint and did not distinguish DevTools from the app target. localhost and the explicit t3code-dev target mount successfully.",
      },
      null,
      2,
    ),
  );
  async function capture(name) {
    const intendedRoute = page.url();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      await page.addStyleTag({
        content: "* { transition: none !important; animation: none !important; }",
      });
      await page.locator("#boot-shell").waitFor({ state: "detached" });
      if (page.url() !== intendedRoute) throw new Error(`Route changed before ${name}`);
      await page.waitForFunction(
        (dark) => document.documentElement.classList.contains("dark") === dark,
        theme === "dark",
      );
      if (name === "real-haiku-turn") {
        await page
          .getByText(
            "Audit my website example.com for AI search. Give me the three most useful next steps.",
            { exact: true },
          )
          .waitFor();
        await page
          .getByRole("article", { name: "Marketing tool result" })
          .filter({ hasText: "6/6 audit categories returned a score" })
          .waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: NodePath.join(out, `electron-${name}-${theme}-1344.png`) });
    }
  }
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await capture("empty-chat");
  await page.evaluate(() => window.t3dev.replay("marketing"));
  await page.getByRole("article", { name: "Marketing tool result" }).waitFor({ timeout: 120000 });
  await page.getByText("This is a controlled Replay result", { exact: false }).waitFor();
  await page.getByRole("complementary", { name: "More with AmICited" }).waitFor();
  await capture("tool-card-turn");
  await page.getByRole("button", { name: "Open full result" }).click();
  await page.getByRole("button", { name: "Ask AI about this" }).click();
  await page.getByTestId("composer-editor").waitFor();
  await page.getByTestId("composer-editor").press("Enter");
  await page.getByRole("button", { name: /Stop generating/ }).waitFor({ state: "hidden" });
  NodeFS.writeFileSync(
    NodePath.join(out, "electron-report-dispatch.txt"),
    await page.locator("body").innerText(),
  );
  await capture("report-context");
  await page.waitForFunction(
    () => !Object.keys(sessionStorage).some((key) => key.startsWith("amicited.report-context.")),
  );
  await page.getByTestId("composer-editor").fill("Thanks, keep this for the next campaign.");
  await page.getByTestId("composer-editor").press("Enter");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("link", { name: "Content tools", exact: true }).click();
  if (!page.url().includes("category=content")) throw new Error("Electron lost category route");
  await capture("tools-content");
  await page.locator(".am-tool-grid > a").first().click();
  await page.getByRole("button", { name: /Run/ }).first().waitFor();
  await capture("tool-form");
  if (process.env.AMICITED_CAPTURE_HOME) {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(NodePath.join(env.T3CODE_HOME, "userdata/statev2.sqlite"), {
      readOnly: true,
    });
    const row = database
      .prepare(
        "SELECT thread_id, title FROM orchestration_v2_projection_threads WHERE thread_id = (SELECT thread_id FROM orchestration_v2_projection_runs WHERE provider_instance_id = 'claudeAgent' ORDER BY requested_at DESC LIMIT 1)",
      )
      .get();
    database.close();
    await page.evaluate(async (threadId) => {
      const { readPrimaryEnvironmentId } = await import(String("/src/state/environments.ts"));
      location.hash = `/${readPrimaryEnvironmentId()}/${threadId}`;
    }, row.thread_id);
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .filter({ hasText: "Website health audit" })
      .waitFor();
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .filter({ hasText: "Website health audit" })
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    await capture("real-haiku-turn");
  }
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(NodePath.join(env.T3CODE_HOME, "userdata/statev2.sqlite"), {
    readOnly: true,
  });
  const outgoing = database
    .prepare(
      "SELECT payload_json FROM orchestration_v2_projection_turn_items WHERE type = 'user_message' ORDER BY updated_at DESC LIMIT 8",
    )
    .all()
    .map((row) => JSON.parse(row.payload_json));
  database.close();
  const reportQuestion = outgoing.find((item) =>
    item.context?.records?.some((record) => record.kind === "marketing-report"),
  );
  if (!reportQuestion) throw new Error("Electron outgoing message did not contain report context");
  const followUp = outgoing.find((item) => item.text.includes("Thanks, keep this"));
  if (!followUp || followUp.context?.records?.some((record) => record.kind === "marketing-report"))
    throw new Error("Electron repeated stale report context");
  NodeFS.writeFileSync(
    NodePath.join(out, "electron-outgoing-context.json"),
    JSON.stringify({ reportQuestion, followUp }, null, 2),
  );
  await cdp.detach();
  const report = JSON.parse(NodeFS.readFileSync(NodePath.join(out, "electron-fonts.json"), "utf8"));
  report.verified = Object.values(report.fonts).every(Boolean);
  report.captures = ["empty-chat", "tool-card-turn"].flatMap((name) =>
    ["light", "dark"].map((theme) => `electron-${name}-${theme}-1344.png`),
  );
  NodeFS.writeFileSync(NodePath.join(out, "electron-fonts.json"), JSON.stringify(report, null, 2));
  NodeFS.rmSync(NodePath.join(out, "electron-error.json"), { force: true });
} catch (error) {
  const failurePage = browser
    ?.contexts()[0]
    ?.pages()
    .find((p) => p.url().startsWith("t3code-dev:"));
  await failurePage?.screenshot({ path: NodePath.join(out, "electron-failure.png") });
  NodeFS.writeFileSync(
    NodePath.join(out, "electron-error.json"),
    JSON.stringify({ error: String(error), home }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  child?.kill("SIGTERM");
  web.kill("SIGTERM");
}
