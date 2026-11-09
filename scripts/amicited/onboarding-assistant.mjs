// Capture real install/sign-in boundaries; never submits account credentials.
// Launch with a fresh FAKE_HOME, then DEBUG_PORT=<port> AMICITED_TRY_INSTALL=1 node this-file <output>.
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";
const root = NodePath.resolve(import.meta.dirname, "../..");
const { chromium } = NodeModule.createRequire(NodePath.join(root, "apps/desktop/package.json"))(
  "playwright-core",
);
const out = NodePath.resolve(process.argv[2] ?? ".amicited-shots/onboarding");
NodeFS.mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.DEBUG_PORT ?? 9333}`);
const index = [];
try {
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().startsWith("t3code-dev:"));
  page.setDefaultTimeout(180000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const capture = async (name, description) => {
    for (const dark of [false, true]) {
      await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
      const file = `${name}${dark ? "-dark" : ""}.png`;
      await page.screenshot({ path: NodePath.join(out, file), animations: "disabled" });
      index.push(`- ${file}: ${description}${dark ? " Dark theme." : ""}`);
    }
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  };
  const start = page.getByRole("button", { name: "Get started", exact: true });
  if (await start.count()) await start.click();
  else if ((await page.getByRole("article", { name: "Claude", exact: true }).count()) === 0)
    await page.evaluate(() => window.dispatchEvent(new Event("amicited-assistant-setup")));
  const claude = page.getByRole("article", { name: "Claude", exact: true });
  const chatgpt = page.getByRole("article", { name: "ChatGPT", exact: true });
  await claude.waitFor();
  await capture("03-assistants", "Detected assistant states, before any setup action.");
  const install = claude.getByRole("button", { name: "Install", exact: true });
  if (process.env.AMICITED_TRY_INSTALL === "1" && (await install.count())) {
    await install.click();
    await claude.getByText("Installing…", { exact: true }).waitFor();
    await capture("04-installing", "Real in-app Claude installation in the fake HOME.");
    await claude
      .getByText(/^(Ready|Installed, sign-in needed)$/)
      .first()
      .waitFor();
    await capture(
      "04b-installed",
      "Detected after the real installer exits. Shared login keychain may supply existing authentication.",
    );
  }
  const signIn = chatgpt.getByRole("button", { name: "Sign in", exact: true });
  if (await signIn.count()) {
    await signIn.click();
    await Promise.race([
      chatgpt.getByText(/Signing in…/).waitFor(),
      chatgpt.getByRole("alert").waitFor(),
    ]);
    if (await chatgpt.getByRole("alert").isVisible()) {
      await capture(
        "05c-sign-in-failed",
        "Actual sign-in failure; browser waiting state was not reached in this attempt.",
      );
      throw new Error("Sign-in failed; inspect the captured app error.");
    }
    await capture(
      "05-browser-sign-in-opened",
      "Managed ChatGPT browser sign-in started; no credentials entered.",
    );
    const cancel = chatgpt.getByRole("button", { name: "Cancel", exact: true });
    if (await cancel.count()) await cancel.click();
  } else {
    await capture(
      "05b-ready-models",
      "Already-signed-in assistants show the exact model in the native picker.",
    );
  }
} catch (error) {
  index.push(`Capture stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  NodeFS.writeFileSync(NodePath.join(out, "assistant-index.md"), index.join("\n") + "\n");
  await browser.close();
}
