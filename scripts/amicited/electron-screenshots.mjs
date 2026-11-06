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
  T3CODE_HOME: NodePath.join(home, "state"),
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
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: NodePath.join(out, `electron-${name}-${theme}-1344.png`) });
    }
  }
  await page.getByRole("textbox", { name: "Website URL" }).fill("https://example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor({ timeout: 120000 });
  await capture("audit");
  await page.getByRole("button", { name: "Go to Home →" }).first().click();
  await page.getByRole("heading", { name: "What will you grow today?" }).waitFor();
  await capture("home");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "amicited.last-result",
      JSON.stringify({
        id: "native-visibility-fixture",
        tool: "ai.visibility.check",
        input: {
          brand: "Acme",
          website: "https://example.com",
          category: "garden tools",
          competitors: ["Contoso"],
        },
        startedAt: "2026-11-06T12:00:00Z",
        durationMs: 1,
        status: "success",
        output: {
          status: "checked",
          provider: "Claude",
          model: "fixture",
          scope: {
            assistants: ["Claude"],
            countries: [],
            prompts: ["Best garden tools?", "Best value garden tools?"],
            runAt: "2026-11-06T12:00:00Z",
          },
          message:
            "Fixture: one assistant, no live search. Position is first appearance among supplied brands.",
          summary: {
            mentioned: 1,
            answered: 2,
            shareOfVoice: 33.3,
            competitors: [{ brand: "Contoso", answers: 2 }],
          },
          answers: [
            {
              prompt: "Best garden tools?",
              mentioned: true,
              position: 2,
              status: "answered",
              excerpt: "Contoso and Acme",
              competitorsMentioned: ["Contoso"],
              citations: ["https://contoso.example/"],
            },
            {
              prompt: "Best value garden tools?",
              mentioned: false,
              position: null,
              status: "answered",
              excerpt: "Contoso",
              competitorsMentioned: ["Contoso"],
              citations: [],
            },
          ],
        },
      }),
    );
    location.hash = "/tools/ai.visibility.check";
  });
  await page.getByRole("tablist", { name: "This visibility check" }).waitFor();
  await page.getByText("Contoso and Acme", { exact: true }).first().waitFor();
  if (await page.getByText("No answer available", { exact: true }).count())
    throw new Error("Visibility fixture lost its excerpt");
  if (await page.getByText("Could not read this answer.", { exact: true }).count())
    throw new Error("Visibility fixture failed answer schema decoding");
  await capture("visibility");
  await cdp.detach();
  const report = JSON.parse(NodeFS.readFileSync(NodePath.join(out, "electron-fonts.json"), "utf8"));
  report.verified = Object.values(report.fonts).every(Boolean);
  report.captures = ["audit", "home", "visibility"].flatMap((name) =>
    ["light", "dark"].map((theme) => `electron-${name}-${theme}-1344.png`),
  );
  NodeFS.writeFileSync(NodePath.join(out, "electron-fonts.json"), JSON.stringify(report, null, 2));
  NodeFS.rmSync(NodePath.join(out, "electron-error.json"), { force: true });
} catch (error) {
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
