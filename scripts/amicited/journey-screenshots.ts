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
      ].map((driver) => [driver, { driver, enabled: driver === "devReplay" }]),
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90_000);
  await page.goto(pairing.replace(new URL(pairing).origin, url));
  await page.getByRole("heading", { name: "What’s your website?" }).waitFor();
  const capture = async (name: string) => {
    for (const [theme, width, height] of [
      ["light", 1344, 1016],
      ["light", 1440, 900],
      ["dark", 1440, 900],
      ["light", 1280, 800],
      ["dark", 1280, 800],
    ] as const) {
      if (
        width !== 1344 &&
        process.env.AMICITED_JOURNEY_QUICK === "1" &&
        (width !== 1440 ||
          (theme !== "light" &&
            ![
              "01-first-launch",
              "02-website-and-ai",
              "02b-provider-sign-in",
              "02c-provider-ready",
              "09-amicited-connect",
              "03-first-win",
              "04-home",
              "04b-subscriptions",
              "06-ai-visibility",
              "06b-visibility-result-fixture",
            ].includes(name)))
      )
        continue;
      if (
        width === 1344 &&
        ![
          "03-first-win",
          "04-home",
          "05-tools-grid",
          "06-ai-visibility",
          "08c-tasks-list",
        ].includes(name)
      )
        continue;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.style.colorScheme = theme;
      }, theme);
      if (name === "01-first-launch")
        await page.getByRole("heading", { name: "What’s your website?" }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: NodePath.join(out, name + "-" + theme + "-" + width + ".png"),
        animations: "disabled",
      });
    }
  };
  await capture("01-first-launch");
  await page.getByRole("textbox", { name: "Website URL" }).fill("https://example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("region", { name: "Tool result" })
    .waitFor()
    .catch(async (error) => {
      console.log(await page.locator("body").innerText());
      await page.screenshot({ path: NodePath.join(out, "journey-error.png") });
      throw error;
    });
  await capture("02-website-and-ai");
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await page.getByRole("complementary", { name: "More with AmICited" }).waitFor();
  await capture("03-first-win");
  await page.getByRole("complementary", { name: "More with AmICited" }).scrollIntoViewIfNeeded();
  await capture("03b-first-win-upsell");
  await page.getByRole("button", { name: "Go to Home →" }).first().click();
  await page.getByRole("heading", { name: "What will you grow today?" }).waitFor();

  await capture("04-home");
  await page.locator("#ai-subscriptions").scrollIntoViewIfNeeded();
  await capture("04b-subscriptions");
  await page
    .getByRole("textbox", { name: "Ask your AI assistant" })
    .fill("Help me plan a campaign");
  await page.getByRole("button", { name: "Send task", exact: true }).click();
  await page.getByText("Connect Claude or ChatGPT to send this task", { exact: true }).waitFor();
  if (await page.getByText("Connect an assistant first", { exact: true }).count())
    throw new Error("Blocked send repeats its connection helper");
  await capture("04c-no-assistant");
  await page.getByRole("button", { name: "Connect Claude", exact: true }).click();
  await page.getByRole("heading", { name: "Connect Claude", exact: true }).scrollIntoViewIfNeeded();
  await page.getByText("Sign in to your assistant", { exact: true }).scrollIntoViewIfNeeded();
  await capture("02b-provider-sign-in");
  await page
    .getByText(/^(Use Claude|In use)$/)
    .first()
    .waitFor();
  const useClaude = page.getByRole("button", { name: "Use Claude", exact: true });
  if (await useClaude.count()) await useClaude.click();
  await page.getByText("In use", { exact: true }).waitFor();
  await page.locator("#ai-subscriptions").scrollIntoViewIfNeeded();
  await capture("02c-provider-ready");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("heading", { name: "Your marketing toolkit" }).waitFor();
  await capture("05-tools-grid");
  await page.getByRole("heading", { name: "Works better with AmICited" }).scrollIntoViewIfNeeded();
  await capture("05b-cloud-capabilities");
  await page.getByRole("button", { name: "Daily AI visibility tracking →" }).click();
  await page.getByRole("dialog", { name: "Daily AI visibility tracking" }).waitFor();
  await capture("05c-cloud-explainer");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(url + "/tools/ai.visibility.check");
  await page.getByRole("textbox", { name: "brand", exact: true }).fill("Acme");
  await page.getByRole("textbox", { name: "website", exact: true }).fill("https://example.com");
  await page.getByRole("textbox", { name: "category", exact: true }).fill("garden tools");
  // Restore an honest disconnected fixture without invoking a paid generation provider.
  await page.evaluate(() =>
    sessionStorage.setItem(
      "amicited.last-result",
      JSON.stringify({
        id: "no-provider-fixture",
        tool: "ai.visibility.check",
        input: {},
        startedAt: "2026-11-06",
        durationMs: 0,
        status: "success",
        output: { status: "needs_provider" },
      }),
    ),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Connect Claude or ChatGPT", exact: true })
    .scrollIntoViewIfNeeded();
  await capture("06a-provider-needed");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "amicited.last-result",
      JSON.stringify({
        id: "visibility-fixture",
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
          message:
            "Fixture: one assistant, no live search. Position is first appearance among supplied brands.",
          provider: "Claude",
          model: "fixture",
          scope: {
            assistants: ["Claude"],
            prompts: ["Best garden tools?", "Best value garden tools?"],
            countries: [],
            runAt: "2026-11-06T12:00:00Z",
          },
          summary: {
            mentioned: 1,
            answered: 2,
            shareOfVoice: 33,
            competitors: [{ brand: "Contoso", answers: 2 }],
          },
          answers: [
            {
              prompt: "Best garden tools?",
              status: "answered",
              mentioned: true,
              position: 2,
              excerpt: "Contoso and Acme offer sturdy tools for small gardens.",
              citations: ["https://example.com/tools"],
            },
            {
              prompt: "Best value garden tools?",
              status: "answered",
              mentioned: false,
              position: null,
              excerpt: "Contoso offers a useful starter set.",
              citations: [],
            },
          ],
        },
      }),
    ),
  );
  await page.reload();
  await page.getByRole("heading", { name: "Mentioned in 1 of 2 answers" }).scrollIntoViewIfNeeded();
  await page
    .getByRole("region", { name: "Tool result" })
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.getByRole("heading", { name: "Brand comparison", exact: true }).waitFor();
  await capture("06-ai-visibility");
  await capture("06b-visibility-result-fixture");
  await page.getByRole("button", { name: "Fix this with AI", exact: true }).first().click();
  await page.waitForURL(/\/draft\//);
  await page
    .getByText("Help my brand become a useful recommendation for:", { exact: false })
    .first()
    .waitFor();
  await page.getByText("Claude", { exact: true }).waitFor();
  await capture("06c-fix-with-ai-task");
  await page.goto(url + "/tools/content.readability");
  await page
    .getByRole("textbox", { name: "text", exact: true })
    .fill(
      "Good content answers a clear question. Keep sentences short. Give your readers useful facts and practical next steps.",
    );
  await page.getByRole("button", { name: "Run check" }).click();
  await page.getByRole("region", { name: "Tool result" }).waitFor();
  await page.getByRole("region", { name: "Tool result" }).scrollIntoViewIfNeeded();
  await capture("07-content-result");
  await page.goto(url + "/new");
  await page.getByRole("heading", { name: "New task", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Your AI subscriptions", exact: true }).waitFor();
  await capture("08-new-task");
  await page
    .getByRole("textbox", { name: "What do you want to get done?" })
    .fill("Draft a short marketing plan");
  // Exercise the one-step form with the free provider, through the normal settings command.
  await page.evaluate(async () => {
    const { serverEnvironment } = await import(String("/src/state/server.ts"));
    const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
    const { readPrimaryEnvironmentId } = await import(String("/src/state/environments.ts"));
    const disabled = await serverEnvironment.mutateProviderInstance.run(appAtomRegistry, {
      environmentId: readPrimaryEnvironmentId(),
      input: {
        providerInstanceMutation: {
          operation: "upsert",
          instanceId: "claudeAgent",
          instance: { driver: "claudeAgent", enabled: false, config: { enabled: false } },
        },
        patch: {},
      },
    });
    if (disabled._tag !== "Success")
      throw new Error("Could not disable paid assistants for the fixture");
    const result = await serverEnvironment.updateSettings.run(appAtomRegistry, {
      environmentId: readPrimaryEnvironmentId(),
      input: {
        patch: { textGenerationModelSelection: { instanceId: "devReplay", model: "multi-turn" } },
      },
    });
    if (result._tag !== "Success") throw new Error("Could not select Replay for the task fixture");
  });
  await page.waitForFunction(async () => {
    const { primaryServerSettingsAtom } = await import(String("/src/state/server.ts"));
    const { appAtomRegistry } = await import(String("/src/rpc/atomRegistry.ts"));
    return (
      appAtomRegistry.get(primaryServerSettingsAtom).textGenerationModelSelection?.instanceId ===
        "devReplay" &&
      appAtomRegistry.get(primaryServerSettingsAtom).providerInstances.claudeAgent?.enabled ===
        false
    );
  });
  await page.getByRole("button", { name: "Send task", exact: true }).click();

  await page.waitForURL(
    (location) =>
      location.pathname.startsWith("/draft/") ||
      location.pathname.split("/").filter(Boolean).length === 2,
  );
  await page.getByText("Draft a short marketing plan", { exact: true }).first().waitFor();
  await capture("08b-task-draft");
  await page.getByText("first fixture turn complete", { exact: true }).first().waitFor();
  await page.getByText("Done", { exact: true }).first().waitFor();
  await capture("08d-task-reply-replay");
  await page.evaluate("window.t3dev.replay('multi-turn')");
  await page.getByText("first fixture turn complete", { exact: true }).first().waitFor();
  await page.goto(url + "/tasks");
  await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
  await capture("08c-tasks-list");

  await page.goto(url + "/marketing-settings");
  await page.getByRole("button", { name: "Connect with AmICited", exact: true }).waitFor();
  await capture("09-amicited-connect");
  await page.getByText("Use an API key instead", { exact: true }).click();
  await page.getByRole("textbox", { name: "Workspace API key" }).waitFor();
  await capture("10-api-key-disclosure");
  await page.getByRole("button", { name: "Permanently hide trial offers", exact: true }).click();
  await page.getByText("Trial offers are permanently hidden.", { exact: true }).waitFor();
  await page.goto(url + "/home");
  await page.getByRole("heading", { name: "What will you grow today?" }).waitFor();
  if (await page.getByRole("link", { name: "Track this daily with AmICited →" }).count())
    throw new Error("Home promoted a permanently hidden trial");
  await page.goto(url + "/tools");
  if (await page.getByRole("heading", { name: "Works better with AmICited" }).count())
    throw new Error("Tools promoted a permanently hidden trial");
  await page.goto(url + "/settings/general");
  await page.getByRole("heading", { name: "Your website / brand" }).waitFor();
  await capture("11-settings-general");
  await page.getByRole("switch", { name: "Developer features" }).click();
  await page.getByRole("switch", { name: "Developer features" }).waitFor();
  await capture("12-developer-mode");
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
