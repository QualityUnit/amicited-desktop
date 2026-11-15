import { assertCaptureReady, applicationPage } from "./onboarding-proof.mjs";
// Run onboarding-launch.mjs first, then DEBUG_PORT=<port> node scripts/amicited/onboarding-capture.mjs <output-dir>.
import * as NodeChildProcess from "node:child_process";
import * as NodeModule from "node:module";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
const root = NodePath.resolve(import.meta.dirname, "../..");
const requireDesktop = NodeModule.createRequire(NodePath.join(root, "apps/desktop/package.json"));
const { chromium } = requireDesktop("playwright-core");
const out = NodePath.resolve(process.argv[2] ?? ".amicited-shots/onboarding");
NodeFS.mkdirSync(out, { recursive: true });
const index = [];
let browser;
try {
  browser = await chromium.connectOverCDP(`http://localhost:${process.env.DEBUG_PORT ?? 9333}`, {
    timeout: 15000,
  });
  const context = browser.contexts()[0];
  const page = await applicationPage(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.setDefaultTimeout(60000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const capture = async (name, description, dark = true) => {
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await assertCaptureReady(page, cdp);
    await page.screenshot({ path: NodePath.join(out, `${name}.png`) });
    index.push(`- ${name}.png: ${description}`);
    if (dark) {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await assertCaptureReady(page, cdp);
      await page.screenshot({ path: NodePath.join(out, `${name}-dark.png`) });
      index.push(`- ${name}-dark.png: Same screen in dark theme.`);
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    }
  };
  if (await page.getByRole("button", { name: "Cancel", exact: true }).count())
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("amicited-run-setup")));
  await page.getByRole("button", { name: "Get started", exact: true }).waitFor();
  await capture("02-welcome", "Welcome; get started or skip setup.");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  if (process.env.AMICITED_TRY_INSTALL === "1") {
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      ["scripts/amicited/onboarding-assistant.mjs", out],
      {
        cwd: root,
        env: process.env,
        stdio: "inherit",
      },
    );
    if (result.status !== 0) throw new Error("Assistant boundary capture failed");
    index.push(NodeFS.readFileSync(NodePath.join(out, "assistant-index.md"), "utf8"));
  } else {
    await capture("03-assistants", "Detected Claude and ChatGPT setup states.");
  }
  const next = page.getByRole("button", { name: "Continue", exact: true });
  if (await next.isEnabled()) await next.click();
  else await page.getByRole("button", { name: "Set up later", exact: true }).click();
  await capture("05-website", "Website step; add a website or skip.");

  await page.getByRole("textbox", { name: "Website", exact: true }).fill("www.flowhunt.io");
  await capture(
    "06-domain",
    "Shared domain form suggests Flowhunt and displays the CMS logo grid.",
  );
  await page
    .getByRole("textbox", { name: "Brand name (optional)", exact: true })
    .fill("My Flowhunt");
  await page.getByRole("textbox", { name: "Website", exact: true }).fill("www.flowhunt.io/docs");
  await capture("06b-brand-edited", "Brand stays My Flowhunt after the website changes.");
  await page.getByRole("radio", { name: /WordPress/ }).focus();
  await page.keyboard.press("ArrowRight");
  await capture("06c-cms-keyboard", "CMS grid with keyboard selection and focus.");
  await page.getByRole("radio", { name: /Git-based site/ }).click();
  await capture("07-site-files", "Git-based sites offer folder, clone or skip.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start chatting", exact: true }).waitFor();
  await capture("08-cloud", "Optional per-domain AmICited connection, credits and pricing.");
  await page.getByRole("button", { name: "Start chatting", exact: true }).click();
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await capture("09-chat", "New chat in flowhunt.io.");
  await page.getByRole("button", { name: "New domain", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New domain", exact: true });
  await dialog.waitFor();
  await capture("09b-new-domain", "Sidebar New domain uses the shared form and CMS logos.");
  await dialog
    .getByRole("textbox", { name: "Website", exact: true })
    .fill("https://www.flowhunt.io/docs");
  await dialog.getByText("flowhunt.io is already added.", { exact: true }).waitFor();
  await capture(
    "09c-domain-already-added",
    "Existing hostname opens its domain without creating a duplicate.",
  );
  await dialog.getByRole("button", { name: "Open it", exact: true }).click();
  if (
    (await page
      .locator('[data-sidebar="sidebar"]')
      .getByText("flowhunt.io", { exact: true })
      .count()) !== 1
  )
    throw new Error("Expected exactly one sidebar domain");
  if (await page.getByText("Campaign fixture", { exact: true }).count())
    throw new Error("Journey contains stale fixture chats");
  for (const width of [860, 1100, 1344, 1710]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1016,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await capture(`context-${width}`, `Composer context at ${width} CSS pixels.`, false);
  }
  if (process.env.AMICITED_REPLAY === "1") {
    await page.evaluate(
      async ({ root, node }) => {
        const { serverEnvironment } = await import("/src/state/server.ts");
        const { appAtomRegistry } = await import("/src/rpc/atomRegistry.ts");
        const { readPrimaryEnvironmentId } = await import("/src/state/environments.ts");
        const environmentId = readPrimaryEnvironmentId();
        const result = await serverEnvironment.mutateProviderInstance.run(appAtomRegistry, {
          environmentId,
          input: {
            patch: {},
            providerInstanceMutation: {
              operation: "upsert",
              instanceId: "devReplay",
              instance: {
                driver: "acpRegistry",
                displayName: "Replay (dev)",
                enabled: true,
                config: {
                  source: "local",
                  enabled: true,
                  commandPath: node,
                  commandArgs: [`${root}/apps/server/scripts/dev-replay-agent.ts`],
                },
              },
            },
          },
        });
        if (result._tag !== "Success") throw new Error("Could not configure Replay");
        await serverEnvironment.refreshProviders.run(appAtomRegistry, { environmentId, input: {} });
      },
      { root, node: process.execPath },
    );
    await page.waitForFunction(async () => {
      const { primaryServerProvidersAtom } = await import("/src/state/server.ts");
      const { appAtomRegistry } = await import("/src/rpc/atomRegistry.ts");
      return appAtomRegistry
        .get(primaryServerProvidersAtom)
        .some(
          (p) =>
            p.instanceId === "devReplay" &&
            p.status === "ready" &&
            p.models.some((m) => m.slug === "marketing"),
        );
    });
    await page.waitForFunction(() => window.t3dev.replayScenarios().includes("marketing"));
    await page.evaluate(() => window.t3dev.replay("marketing", "full-access"));
    await page.getByText(/Ran website health audit.*41\/100/).waitFor({ timeout: 120000 });
    await page
      .getByText("This is a controlled Replay result for the development preview.", { exact: true })
      .waitFor({ timeout: 120000 });
    await capture(
      "10-answer-replay",
      "Controlled Replay answer; no production provider or cloud account is implied.",
    );
  }
} catch (error) {
  index.push(`\nCapture stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  NodeFS.writeFileSync(
    NodePath.join(out, "index.md"),
    "# Onboarding journey\n\n" + index.join("\n") + "\n",
  );
  await browser?.close();
}
