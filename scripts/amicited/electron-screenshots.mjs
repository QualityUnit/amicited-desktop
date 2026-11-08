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
  T3CODE_DEV_REPLAY_CAPTURE: "1",
  T3CODE_NO_BROWSER: "1",
  T3CODE_SINGLE_ORIGIN_DEV: "1",
};
if (process.env.AMICITED_CAPTURE_OAUTH === "1") {
  env.AMICITED_OAUTH_CAPTURE_URL = NodePath.join(home, "oauth-url");
}
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
  `require('node:os').homedir=()=>${JSON.stringify(home)};require(${JSON.stringify(NodePath.join(root, "apps/desktop/dist-electron/main.cjs"))});require('electron').app.on('web-contents-created',(_,w)=>w.on('did-finish-load',()=>{if(w.getURL().startsWith('t3code-dev:')){w.closeDevTools();console.log('NATIVE_RENDERER_READY')}}));`,
);
let child, browser;
try {
  await webReady;
  process.env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL;
  const { resolveElectronLaunchCommand } =
    await import("../../apps/desktop/scripts/electron-launcher.mjs");
  resolveElectronLaunchCommand();
  const executable =
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone capture selects the platform Electron binary.
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
  page.setDefaultTimeout(120_000);
  await page.locator("[data-amicited-shell]").first().waitFor({ timeout: 120000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  await cdp.send("Overlay.disable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  const fonts = await page.evaluate(async () => {
    const values = {};
    for (const family of ["-apple-system", "system-ui"])
      values[family] = document.fonts.check(`14px ${family}`);
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
  const parity = {};
  async function readStyles() {
    return page.evaluate(async () => {
      await document.fonts.ready;
      const selectors = {
        sidebar:
          '[data-chat-history-link][aria-current="page"] [data-marketing-history-title], [data-testid="sidebar-row-card"][aria-current="page"] span[aria-hidden].text-sm',
        header: '[data-slot="workspace-breadcrumb-text"]',
        composer: '[data-testid="composer-editor"]',
        timeline: "[data-thread-find-text] p",
        brandHeader:
          '.am-chat-brand > div:first-child, [data-slot="sidebar"] > div:has(a[aria-label="T3 Code home"])',
        collapseToggle: "[data-sidebar-control] button",
        contextLine: '.am-composer-context button, button[aria-label^="Permissions:"]',
        selectionBounds:
          '.am-history-row:has([aria-current="page"]), [data-sidebar-row][aria-current="page"]',
        composerSurface: '[data-slot="composer-host"]',
        sidebarRow:
          '[data-chat-history-link][aria-current="page"] [data-marketing-history-title], [data-testid="sidebar-row-card"][aria-current="page"] span[aria-hidden].text-sm',
        headerLayout: '[aria-label="Task breadcrumb"], [aria-label="Thread breadcrumb"]',
        workLog:
          '.am-tool-card [data-slot="collapsible-trigger"] .text-secondary-label, [class~="group/timeline-row"] .text-secondary-label',
      };
      return Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => {
          const elements = document.querySelectorAll(selector);
          let el =
            name === "header"
              ? elements[elements.length - 1]
              : Array.from(elements).find((element) => element.getBoundingClientRect().width > 0);
          if (name === "brandHeader" && !document.querySelector(".am-chat-brand"))
            el = document.querySelector('a[aria-label="T3 Code home"]')?.parentElement
              ?.parentElement?.parentElement;
          if (name === "contextLine" && !el)
            el = Array.from(document.querySelectorAll("button")).find((button) =>
              button.textContent?.includes("Full access"),
            );
          if (!el) return [name, null];
          const style = getComputedStyle(el);
          return [
            name,
            {
              bounds: el.getBoundingClientRect().toJSON(),
              ...Object.fromEntries(
                [
                  "backgroundColor",
                  "translate",
                  "transform",
                  "fontFamily",
                  "fontSize",
                  "color",
                  "lineHeight",
                  "paddingTop",
                  "paddingRight",
                  "paddingBottom",
                  "paddingLeft",
                  "height",
                  "width",
                  "borderWidth",
                  "borderRadius",
                ].map((key) => [key, style[key]]),
              ),
            },
          ];
        }),
      );
    });
  }
  async function capture(name) {
    if (name === "report-context") await page.waitForURL((url) => !url.hash.includes("/draft/"));
    await page
      .locator('.am-history-row:has([aria-current="page"]) [data-status="Working"]')
      .waitFor({ state: "hidden" });
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
      await page.mouse.move(1000, 100);
      await page.evaluate(() => document.fonts.ready);
      if (["empty-chat", "tool-card-turn", "reference-t3-turn"].includes(name))
        parity[`${name}-${theme}`] = await readStyles();
      await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
      await page.screenshot({ path: NodePath.join(out, `electron-${name}-${theme}-1344.png`) });
    }
  }
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await capture("empty-chat");
  const marketerInset = await page.evaluate(() => {
    const toggle = document.querySelector("[data-sidebar-control]");
    const brand = document.querySelector("[data-amicited-brand]");
    return {
      left: toggle.getBoundingClientRect().left,
      brandLeft: brand.getBoundingClientRect().left,
      drag: getComputedStyle(document.querySelector(".am-chat-brand")).getPropertyValue(
        "-webkit-app-region",
      ),
    };
  });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  const collapsedInset = await page.evaluate(() => {
    const toggle = document.querySelector("[data-sidebar-control]").getBoundingClientRect();
    const rail = document.querySelector(".am-chat-sidebar").getBoundingClientRect();
    return { left: toggle.left, right: toggle.right, railRight: rail.right };
  });
  if (collapsedInset.left !== marketerInset.left || collapsedInset.right > 1344)
    throw new Error("Collapsed rail overlaps the native controls or clips its toggle");
  await capture("collapsed-native-controls");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).waitFor();
  await capture("expanded-after-click");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Chat history", exact: true }).click();
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).waitFor();
  await page.keyboard.press("Meta+b");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).waitFor();
  await page.keyboard.press("Meta+b");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).waitFor();
  await capture("expanded-after-shortcut");
  await page.evaluate(() => localStorage.setItem("amicited.workspace-mode", "developer"));
  await page.reload();
  await page.getByRole("link", { name: "T3 Code home", exact: true }).waitFor();
  const developerInset = await page.evaluate(() => {
    const toggle = document.querySelector(
      '[data-sidebar-control] button[aria-label="Toggle main sidebar"]',
    );
    const brand = document.querySelector('a[aria-label="T3 Code home"]');
    return {
      left: toggle.getBoundingClientRect().left,
      brandLeft: brand.getBoundingClientRect().left,
    };
  });
  NodeFS.writeFileSync(
    NodePath.join(out, "macos-controls-layout-proof.json"),
    JSON.stringify(
      {
        marketerInset,
        collapsedInset,
        developerInset,
        method: "computed layout in the same Electron window",
      },
      null,
      2,
    ),
  );
  if (
    Math.abs(marketerInset.left - developerInset.left) > 1 ||
    Math.abs(marketerInset.brandLeft - developerInset.brandLeft) > 1 ||
    marketerInset.drag !== "drag"
  )
    throw new Error("Native titlebar inset differs from developer mode");
  await page.evaluate(() => localStorage.setItem("amicited.workspace-mode", "marketer"));
  await page.reload();
  await page.locator("[data-amicited-shell]").waitFor();

  await page.evaluate(() => {
    localStorage.setItem(
      "amicited.brand",
      JSON.stringify({ website: "https://example.com", name: "Example" }),
    );
  });
  await page.reload();
  await page.getByTestId("composer-editor").waitFor();
  await page.getByTestId("sidebar-project-folder").filter({ hasText: "example.com" }).waitFor();
  await page.evaluate(() => window.t3dev.replay("marketing"));
  await page.getByRole("article", { name: "Marketing tool result" }).waitFor({ timeout: 120000 });
  await page.getByText("This is a controlled Replay result", { exact: false }).waitFor();
  await page.getByRole("complementary", { name: "More with AmICited" }).waitFor();
  const marketingTurnUrl = page.url();
  await capture("tool-card-turn");
  await page.evaluate(() => window.t3dev.replay("marketing-failed"));
  await page
    .getByText("Could not check: the website did not respond. Try again later.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: /Stop generating/ }).waitFor({ state: "hidden" });
  await capture("failed-tool");
  if (process.env.AMICITED_SKIP_REPORT_PROBE !== "1") {
    await page.goto(marketingTurnUrl);
    await page.getByRole("button", { name: "Open full result" }).waitFor();
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
    await page.getByText("Thanks, keep this for the next campaign.", { exact: true }).waitFor();
  }
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Content tools", exact: true }).click();
  if (!page.url().includes("category=content")) throw new Error("Electron lost category route");
  await capture("tools-content");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Developer features" }).waitFor();
  await capture("settings");
  await page.getByRole("link", { name: "AmICited", exact: true }).click();
  await page.getByRole("button", { name: "Connect with AmICited" }).first().waitFor();
  for (const state of ["waiting", "free", "upgrade"]) {
    await page.evaluate((state) => {
      window.dispatchEvent(
        new CustomEvent("amicited-cloud-evidence", {
          detail:
            state === "waiting"
              ? { state: "connecting" }
              : {
                  state: "connected",
                  workspace: "your AmICited workspace",
                  scopes: [],
                  access: "free",
                },
        }),
      );
    }, state);
    if (state === "waiting")
      await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
    else await page.getByText(/Connected to your AmICited workspace/).waitFor();
    await capture("cloud-" + state);
  }
  await page.evaluate(() => window.t3dev.replay("marketing-cloud"));
  await page.getByText(/The free site health check is complete/).waitFor();
  await page.getByRole("article", { name: "AmICited tool result" }).last().waitFor();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("amicited-cloud-evidence", {
        detail: {
          state: "connected",
          workspace: "your AmICited workspace",
          scopes: [],
          access: "free",
        },
      }),
    ),
  );
  await page.getByText("AmICited connected", { exact: true }).waitFor();
  await capture("cloud-site-health");

  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Content tools", exact: true }).click();
  await page.locator(".am-tool-list > a").first().click();
  await page.getByRole("button", { name: /Run/ }).first().waitFor();
  await capture("tool-form");
  if (process.env.AMICITED_CAPTURE_HOME && process.env.AMICITED_REUSE_REAL === "1") {
    if (process.env.AMICITED_SKIP_REPORT_PROBE !== "1") {
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
  }
  if (process.env.AMICITED_SKIP_REPORT_PROBE !== "1") {
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
    if (!reportQuestion)
      throw new Error("Electron outgoing message did not contain report context");
    const followUp = outgoing.find((item) => item.text.includes("Thanks, keep this"));
    if (
      !followUp ||
      followUp.context?.records?.some((record) => record.kind === "marketing-report")
    )
      throw new Error("Electron repeated stale report context");
    NodeFS.writeFileSync(
      NodePath.join(out, "electron-outgoing-context.json"),
      JSON.stringify({ reportQuestion, followUp }, null, 2),
    );
  }
  await page.goto(marketingTurnUrl);
  await page.getByTestId("composer-editor").waitFor();
  await page.evaluate(() => localStorage.setItem("amicited.workspace-mode", "developer"));
  await page.reload();
  await page.getByRole("link", { name: "T3 Code home", exact: true }).waitFor();
  await page.evaluate(() => window.t3dev.replay("showcase"));
  await page
    .getByRole("button", { name: /Allow|Approve/, exact: false })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: /Allow|Approve/, exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: /Stop generating/ }).waitFor({ state: "hidden" });
  await page.getByText("I added", { exact: false }).first().waitFor();
  const completedWork = page.getByRole("button", { name: /^Worked for/ });
  await completedWork.first().waitFor();
  await completedWork.first().click();
  await completedWork.first().and(page.locator('[aria-expanded="true"]')).waitFor();
  await page.locator('[class~="group/timeline-row"]').first().waitFor();
  await capture("reference-t3-turn");
  NodeFS.writeFileSync(
    NodePath.join(out, "style-parity.json"),
    JSON.stringify(
      {
        fonts,
        samples: parity,
        comparison: Object.fromEntries(
          ["light", "dark"].map((theme) => [
            theme,
            Object.fromEntries(
              ["sidebar", "header", "composer", "timeline", "sidebarRow", "workLog"].map((key) => [
                key,
                {
                  marketer: parity[`tool-card-turn-${theme}`][key],
                  developer: parity[`reference-t3-turn-${theme}`][key],
                },
              ]),
            ),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  if (process.env.AMICITED_CAPTURE_OAUTH === "1") {
    await page.evaluate(() => {
      localStorage.setItem("amicited.workspace-mode", "marketer");
      window.location.hash = "/marketing-settings";
    });
    await page.reload();
    let watcher;
    let launchTimer;
    const launched = new Promise((resolve, reject) => {
      launchTimer = setTimeout(() => {
        watcher.close();
        reject(
          new Error("Production OAuth did not reach the browser-open boundary within 40 seconds."),
        );
      }, 40_000);
      watcher = NodeFS.watch(home, (_, name) => {
        if (
          name === "oauth-url" &&
          NodeFS.readFileSync(env.AMICITED_OAUTH_CAPTURE_URL, "utf8").length
        ) {
          clearTimeout(launchTimer);
          watcher.close();
          resolve(NodeFS.readFileSync(env.AMICITED_OAUTH_CAPTURE_URL, "utf8"));
        }
      });
    });
    void launched.catch(() => {});
    await page.getByRole("button", { name: "Connect with AmICited", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
    await capture("production-oauth-waiting");
    const loginBrowser = await chromium.launch({ headless: true });
    try {
      const authorizeUrl = await launched;
      NodeFS.writeFileSync(
        NodePath.join(out, "production-oauth-boundary.json"),
        JSON.stringify(
          {
            launcherCalled: true,
            authorizeUrl,
            stateRedacted: true,
            note: "Actual production launcher invoked from Electron Connect. Browser sign-in cancelled; no form submitted.",
          },
          null,
          2,
        ),
      );
      await capture("production-oauth-launched");
    } catch (error) {
      NodeFS.writeFileSync(
        NodePath.join(out, "production-oauth-boundary.json"),
        JSON.stringify({ loginCaptured: false, reason: String(error) }, null, 2),
      );
    } finally {
      clearTimeout(launchTimer);
      watcher.close();
      await loginBrowser.close();
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      if (await cancel.count()) await cancel.click();
    }
  }
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
