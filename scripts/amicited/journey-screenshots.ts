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
await NodeFSP.writeFile(
  NodePath.join(out, "capture-head.txt"),
  NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }),
);
const home =
  process.env.AMICITED_CAPTURE_HOME ??
  (await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "amicited-journey-")));
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
      ].map((driver) => [
        driver,
        { driver, enabled: process.env.AMICITED_REUSE_REAL === "1" && driver === "devReplay" },
      ]),
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
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await page.goto(pairing.replace(new URL(pairing).origin, url));
  await page.locator("[data-amicited-shell]").waitFor({ timeout: 120000 });
  const capture = async (name: string) => {
    const intendedRoute = page.url();
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
      await page.addStyleTag({
        content:
          "*, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      if (!name.startsWith("reference-")) await page.locator("[data-amicited-shell]").waitFor();
      await page.locator("#boot-shell").waitFor({ state: "detached" });
      await page.getByTestId("composer-editor").or(page.getByRole("main")).first().waitFor();
      if (page.url() !== intendedRoute) throw new Error(`Route changed before ${name}`);
      await page.waitForFunction(
        (dark) => document.documentElement.classList.contains("dark") === dark,
        theme === "dark",
      );
      if (name === "09-failed-tool")
        await page
          .getByText("Could not check: the website did not respond. Try again later.", {
            exact: true,
          })
          .waitFor();
      if (name === "12-sign-in-recovery" || name === "12b-sidebar-statuses") {
        await page.getByRole("button", { name: "Sign in to Claude", exact: true }).waitFor();
        await page.locator('.am-history-status[data-status="Sign in needed"]').first().waitFor();
      }
      if (name === "03-tool-card-turn" || name === "11-real-haiku-turn")
        await page.getByRole("article", { name: "Marketing tool result" }).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: NodePath.join(out, `${name}-${theme}-${width}.png`) });
    }
  };
  if (process.env.AMICITED_REUSE_REAL !== "1") {
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
    await page.getByText("Thinking…", { exact: true }).waitFor();
    await capture("03b-thinking");
    await page.locator('[data-state="pending"]').waitFor();
    await capture("03a-mid-stream");
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .first()
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
    await page.getByText("Partial", { exact: true }).waitFor();
    await capture("03c-partial-coverage");
    const marketingChatUrl = page.url();
    await page.getByRole("button", { name: "Open full result" }).click();
    await page.getByRole("region", { name: "Tool result" }).waitFor();
    await capture("04-full-result");
    await page.getByRole("button", { name: "Back to chat", exact: false }).click();
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .first()
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
    await page.getByRole("article", { name: "Marketing tool result" }).first().waitFor();
    await page.evaluate(() =>
      (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
        "marketing",
      ),
    );
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .first()
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
    await page.getByRole("button", { name: /Stop generating/ }).waitFor({ state: "hidden" });
    await page.getByText("This is a controlled Replay result", { exact: false }).first().waitFor();
    await page.mouse.move(1000, 100);
    await capture("05-chat-list");
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .click();
    await capture("05b-chat-menu");
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await capture("05c-delete-confirmation");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
    await page.waitForURL(/\/draft\//);
    await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
    await page.getByRole("button", { name: "Archived", exact: true }).click();
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .waitFor();
    await capture("05d-archived");
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .waitFor({ state: "hidden" });
    await page.getByText("No archived chats", { exact: true }).waitFor();
    await capture("05e-archived-empty");
    await page.getByRole("button", { name: "Back to chats", exact: true }).click();
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page.getByRole("textbox", { name: "Chat name" }).fill("Website audit review");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("button", { name: /Website audit review/ })
      .first()
      .waitFor();
    const firstHistory = page.locator("[data-chat-history-link]").first();
    await firstHistory.focus();
    await firstHistory.press("ArrowDown");
    if (await firstHistory.evaluate((element) => element === document.activeElement))
      throw new Error("History ArrowDown did not move focus");
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await page.waitForURL(/\/draft\//);
    await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
    await page.evaluate(async () => {
      const { useComposerDraftStore } = await import(String("/src/composerDraftStore.ts"));
      const draftId = location.pathname.split("/").at(-1);
      useComposerDraftStore
        .getState()
        .setModelSelection(
          draftId,
          { instanceId: "devReplay", model: "marketing" },
          { replaceOptions: true, explicit: true },
        );
    });
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
    await page.goto(url + "/tools/content.readability");
    await page
      .getByRole("textbox", { name: "text", exact: true })
      .fill("Our campaign helps small teams write clearly. Keep the message useful and concise.");
    await page.getByRole("button", { name: "Run check", exact: true }).click();
    await page.getByRole("button", { name: "Ask AI about this", exact: true }).waitFor();
    await capture("08b-readability-result");
    await page.getByRole("button", { name: "Ask AI about this", exact: true }).click();
    await page.getByTestId("composer-editor").waitFor();
    await capture("08c-readability-context");
    await NodeFSP.writeFile(
      NodePath.join(out, "readability-report-context.json"),
      await page.evaluate(() =>
        JSON.stringify(
          Object.fromEntries(
            Object.entries(sessionStorage).filter(([key]) =>
              key.startsWith("amicited.report-context."),
            ),
          ),
          null,
          2,
        ),
      ),
    );
    await page.goto(marketingChatUrl);
    await page.waitForFunction(() => Boolean((window as unknown as { t3dev?: unknown }).t3dev));
    await page.evaluate(() =>
      (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
        "marketing-failed",
      ),
    );
    await page
      .getByText("Could not check: the website did not respond. Try again later.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Stop generating", exact: false })
      .waitFor({ state: "hidden" });
    await capture("09-failed-tool");
    await page.evaluate(() =>
      (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
        "marketing-approval",
      ),
    );
    await page.getByText("Needs your OK", { exact: true }).first().waitFor();
    await capture("10-pending-approval");
    await page
      .getByRole("button", { name: /^(Yes|Approve|Allow once|Allow)$/ })
      .last()
      .click();
    await page.getByText("This is a controlled Replay result", { exact: false }).first().waitFor();
    await page.evaluate(() =>
      (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
        "marketing-readability-approval",
      ),
    );
    await page.getByRole("group", { name: "Marketing approval" }).waitFor();
    await capture("10b-readability-approval");
    await page.getByRole("button", { name: "Don't allow", exact: true }).click();
    if (process.env.AMICITED_REAL_PROVIDER === "1") {
      await page.evaluate(async () => {
        const { serverEnvironment, primaryServerSettingsAtom } = await import(
          String("/src/state/server.ts")
        );
        const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
        const { readPrimaryEnvironmentId } = await import(String("/src/state/environments.ts"));
        const instance =
          appAtomRegistry.get(primaryServerSettingsAtom).providerInstances.claudeAgent;
        const result = await serverEnvironment.mutateProviderInstance.run(appAtomRegistry, {
          environmentId: readPrimaryEnvironmentId(),
          input: {
            providerInstanceMutation: {
              operation: "upsert",
              instanceId: "claudeAgent",
              instance: {
                ...instance,
                enabled: true,
                config: { ...instance.config, enabled: true },
              },
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
      await page.getByRole("button", { name: "New chat", exact: true }).click();
      await page.waitForURL(/\/draft\//);
      await page.getByTestId("composer-editor").waitFor();
      await page.evaluate(async () => {
        const { useComposerDraftStore } = await import(String("/src/composerDraftStore.ts"));
        const state = useComposerDraftStore.getState();
        state.setStickyModelSelection({ instanceId: "claudeAgent", model: "claude-haiku-4-5" });
        state.setModelSelection(
          location.pathname.split("/").at(-1),
          { instanceId: "claudeAgent", model: "claude-haiku-4-5" },
          { replaceOptions: true, explicit: true },
        );
      });
      console.log(
        "REAL SELECTION",
        await page
          .getByTestId("composer-editor")
          .locator("..")
          .innerText()
          .catch(() => ""),
      );
      await page
        .getByRole("button", { name: /Claude Haiku/ })
        .waitFor({ timeout: 30000 })
        .catch(async (error) => {
          await NodeFSP.writeFile(
            NodePath.join(out, "real-selection-debug.txt"),
            await page.locator("body").innerText(),
          );
          throw error;
        });
      await page
        .getByTestId("composer-editor")
        .fill(
          "Audit my website example.com for AI search. Give me the three most useful next steps.",
        );
      await page.getByTestId("composer-editor").press("Enter");
      await page
        .getByRole("article", { name: "Marketing tool result" })
        .first()
        .waitFor({ timeout: 180000 });
      await page
        .getByRole("button", { name: "Submit message", exact: true })
        .waitFor({ timeout: 180000 });
      const realChatUrl = page.url();
      const match = /\/([^/]+)$/.exec(new URL(realChatUrl).pathname);
      if (match) {
        await page.getByRole("article", { name: "Marketing tool result" }).first().waitFor();
        const transcript = await page.locator("body").innerText();
        await NodeFSP.writeFile(
          NodePath.join(out, "real-provider-transcript.txt"),
          "\nRendered transcript:\n" + transcript,
        );
        await page.getByRole("button", { name: "Open full result" }).click();
        const result = await page.evaluate(() => sessionStorage.getItem("amicited.last-result"));
        await NodeFSP.writeFile(
          NodePath.join(out, "real-provider-tool-result.json"),
          result ?? "null",
        );
        await page.goto(realChatUrl);
        await page.getByRole("article", { name: "Marketing tool result" }).first().waitFor();
        await page
          .getByRole("article", { name: "Marketing tool result" })
          .filter({ hasText: "Website health audit" })
          .evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page
          .getByRole("button", { name: /Chat actions for/ })
          .filter({ visible: true })
          .first()
          .click();
        await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
        await page
          .getByRole("textbox", { name: "Chat name" })
          .fill("Website audit — technical snapshot for example.com");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await capture("11-real-haiku-turn");
      }
    }
  }
  if (process.env.AMICITED_REUSE_REAL === "1") {
    await page.evaluate(() =>
      localStorage.setItem(
        "amicited.brand",
        JSON.stringify({ website: "https://example.com", name: "Example" }),
      ),
    );
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(NodePath.join(home, "userdata/statev2.sqlite"), {
      readOnly: true,
    });
    const run = database
      .prepare(
        "SELECT thread_id FROM orchestration_v2_projection_runs WHERE provider_instance_id = 'claudeAgent' AND status = 'completed' ORDER BY requested_at DESC LIMIT 1",
      )
      .get() as { thread_id: string };
    const events = database
      .prepare(
        "SELECT payload_json FROM orchestration_v2_projection_turn_items WHERE thread_id = ? ORDER BY ordinal",
      )
      .all(run.thread_id);
    database.close();
    await NodeFSP.writeFile(
      NodePath.join(out, "real-provider-events.json"),
      JSON.stringify(
        events.map((row) => JSON.parse(String(row.payload_json))),
        null,
        2,
      ),
    );
    const environment = await page.evaluate(async () =>
      (await import(String("/src/state/environments.ts"))).readPrimaryEnvironmentId(),
    );
    const chatUrl = `${url}/${environment}/${run.thread_id}`;
    await page.goto(chatUrl);
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .filter({ hasText: "Website health audit" })
      .waitFor();
    await NodeFSP.writeFile(
      NodePath.join(out, "real-provider-transcript.txt"),
      await page.locator("body").innerText(),
    );
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .filter({ hasText: "Website health audit" })
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    await capture("11-real-haiku-turn");
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .filter({ hasText: "Website health audit" })
      .getByRole("button", { name: "Open full result" })
      .click();
    await NodeFSP.writeFile(
      NodePath.join(out, "real-provider-tool-result.json"),
      (await page.evaluate(() => sessionStorage.getItem("amicited.last-result"))) ?? "null",
    );
    await page.goto(chatUrl);
  }
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.waitForURL(/\/draft\//);
  await page.getByTestId("composer-editor").waitFor();
  await page.evaluate(() =>
    (window as unknown as { t3dev: { replay(s: string): Promise<unknown> } }).t3dev.replay(
      "marketing-auth",
    ),
  );
  await page.getByRole("button", { name: "Sign in to Claude", exact: true }).waitFor();
  await capture("12-sign-in-recovery");
  for (const [index, title] of [
    "Website audit — review crawler access and discovery recommendations",
    "Website audit — technical snapshot for example.com",
    "AI search visibility — review the latest website findings",
  ].entries()) {
    await page
      .getByRole("button", { name: /Chat actions for/ })
      .nth(index)
      .click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page.getByRole("textbox", { name: "Chat name" }).fill(title);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("textbox", { name: "Chat name" }).waitFor({ state: "hidden" });
  }
  await capture("12b-sidebar-statuses");
  await NodeFSP.writeFile(
    NodePath.join(out, "sign-in-recovery-transcript.txt"),
    await page.locator("body").innerText(),
  );
  await page.reload();
  await page.evaluate(() => localStorage.setItem("t3code:theme", "dark"));
  await page.reload();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.waitForURL(/\/draft\//);
  await page.getByTestId("composer-editor").waitFor();
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.addStyleTag({ content: "* { transition: none !important; }" });
  await page.setViewportSize({ width: 1344, height: 1016 });
  await page.getByRole("button", { name: "example.com", exact: true }).click();
  await page.getByRole("dialog", { name: "Website" }).waitFor();
  await page.screenshot({ path: NodePath.join(out, "13-fresh-dark-1344.png") });
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
    .getByRole("button", { name: /^(Yes|Approve|Allow once|Allow)$/ })
    .last()
    .click();
  await page.getByText("I added", { exact: false }).first().waitFor();
  const fold = page.getByRole("button", { name: /^Worked for/ });
  if (await fold.count()) await fold.first().click();
  await capture("reference-t3-showcase");
  await capture("reference-t3-sidebar");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("General", { exact: true }).first().waitFor();
  await capture("reference-t3-settings");
  const fonts = await page.evaluate(async () => {
    const result: Record<string, boolean> = {};
    for (const family of ["-apple-system", "system-ui"])
      result[family] = document.fonts.check(`14px ${family}`);
    return { faces: result, devicePixelRatio };
  });
  await NodeFSP.writeFile(NodePath.join(out, "browser-fonts.json"), JSON.stringify(fonts, null, 2));
  await NodeFSP.rm(NodePath.join(out, "journey-error.png"), { force: true });
  console.log(out);
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    await failedPage.screenshot({ path: NodePath.join(out, "journey-error.png") });
    await NodeFSP.writeFile(
      NodePath.join(out, "journey-error.txt"),
      await failedPage.locator("body").innerText(),
    );
  }
  throw error;
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
  if (process.env.AMICITED_KEEP_HOME === "1")
    await NodeFSP.writeFile(NodePath.join(out, "isolated-home.txt"), home);
  else await NodeFSP.rm(home, { recursive: true, force: true });
}
