// Run onboarding-launch.mjs first, then DEBUG_PORT=<port> node scripts/amicited/onboarding-capture.mjs <output-dir>.
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
  const page =
    context.pages().find((p) => p.url().startsWith("t3code-dev:")) ??
    context.pages().find((p) => !p.url().startsWith("devtools:"));
  if (!page) throw new Error("Electron has no application page.");
  page.setDefaultTimeout(15000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const capture = async (name, description, dark = true) => {
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.screenshot({ path: NodePath.join(out, `${name}.png`) });
    index.push(`- ${name}.png: ${description}`);
    if (dark) {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({ path: NodePath.join(out, `${name}-dark.png`) });
      index.push(`- ${name}-dark.png: Same screen in dark theme.`);
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    }
  };
  await page.getByRole("button", { name: "Get started", exact: true }).waitFor();
  await capture("02-welcome", "Welcome; get started or skip setup.");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await capture("03-assistants", "Detected Claude and ChatGPT setup states.");
  if (process.env.AMICITED_TRY_INSTALL === "1") {
    await page
      .getByRole("article", { name: "Claude", exact: true })
      .getByRole("button", { name: "Install", exact: true })
      .click();
    await page.getByText("Installing…", { exact: true }).waitFor();
    await capture("04-installing", "Real Claude installation started by clicking Install.");
    throw new Error(
      "Complete the real browser sign-in before continuing; rerun with AMICITED_TRY_INSTALL unset in a ready profile.",
    );
  }
  const next = page.getByRole("button", { name: "Continue", exact: true });
  if (await next.isEnabled()) await next.click();
  else
    await page
      .getByRole("button", { name: "Set up later (chats need an assistant)", exact: true })
      .click();
  await capture("05-website", "Website step; add a website or skip.");
  await page.getByRole("button", { name: "Add website", exact: true }).click();
  await page.getByRole("textbox", { name: "Website", exact: true }).fill("https://flowhunt.io");
  await capture(
    "06-domain",
    "Shared domain form suggests Flowhunt and displays the CMS logo grid.",
  );
  await page.getByRole("radio", { name: /Git-based site/ }).click();
  await capture("07-site-files", "Git-based sites offer folder, clone or skip.");
  await page.getByRole("button", { name: "Create domain", exact: true }).click();
  await page.getByRole("button", { name: "Start chatting", exact: true }).waitFor();
  await capture("08-cloud", "Optional per-domain AmICited connection, credits and pricing.");
  await page.getByRole("button", { name: "Start chatting", exact: true }).click();
  await page.getByRole("heading", { name: "What do you want to work on?" }).waitFor();
  await capture("09-chat", "New chat in flowhunt.io.", false);
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
    await page.evaluate(() => window.t3dev.replay("marketing", "full-access"));
    await page
      .getByRole("article", { name: "Marketing tool result" })
      .first()
      .waitFor({ timeout: 45000 });
    await capture(
      "10-answer-replay",
      "Controlled Replay answer; no production provider or cloud account is implied.",
      false,
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
