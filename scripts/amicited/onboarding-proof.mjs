import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "amicited-overlay-"));
const checker = process.env.AMICITED_OVERLAY_CHECK ?? NodePath.join(scratch, "check-overlay");
if (!process.env.AMICITED_OVERLAY_CHECK)
  NodeChildProcess.execFileSync("swiftc", [
    NodePath.join(import.meta.dirname, "onboarding-overlay-check.swift"),
    "-o",
    checker,
  ]);
process.once("exit", () => NodeFS.rmSync(scratch, { recursive: true, force: true }));
// All journey captures share these checks so transition frames fail the run.
export async function assertCaptureReady(page, cdp) {
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  await cdp.send("Overlay.disable");
  // Chromium retains the last resize label briefly even after the overlay agent is disabled.
  await page.waitForTimeout(1200);
  const probe = NodePath.join(scratch, "probe.png");
  NodeFS.writeFileSync(probe, await page.screenshot());
  NodeChildProcess.execFileSync(checker, [probe]);
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    );
    const visible = (element) => element.checkVisibility();
    const surfaces = [
      ...document.querySelectorAll('[role="dialog"], [data-onboarding-surface]'),
    ].filter(visible);
    if (surfaces.length > 1) throw new Error(`Overlapping surfaces: ${surfaces.length}`);
    if (document.getAnimations().some((a) => a.playState !== "finished"))
      throw new Error("Animation still running");
    for (const row of document.querySelectorAll(".am-composer-context")) {
      if (row.scrollWidth > row.clientWidth + 1) throw new Error("Composer context overflows");
      const children = [...row.children]
        .filter(visible)
        .map((element) => element.getBoundingClientRect());
      if (
        children.some(
          (rect) =>
            rect.height &&
            Math.abs(rect.y + rect.height / 2 - (children[0].y + children[0].height / 2)) > 2,
        )
      )
        throw new Error("Composer context wraps");
    }
    const assistantActions = [
      ...document.querySelectorAll('[data-am="am-assistant-action"] > button:first-child'),
    ].filter(visible);
    if (assistantActions.length === 2) {
      const [a, b] = assistantActions.map((button) => button.getBoundingClientRect());
      if (
        Math.abs(a.top - b.top) > 1 ||
        Math.abs(a.height - b.height) > 1 ||
        Math.abs(a.width - b.width) > 1
      )
        throw new Error("Assistant action buttons are misaligned");
    }
    if (/signing in in/.test(document.body.innerText)) throw new Error("Doubled sign-in copy");
    const setup = document.querySelector("[data-onboarding-surface]");
    if (setup) {
      if (document.querySelector('[data-sidebar="sidebar"]'))
        throw new Error("Sidebar mounted during setup");
      for (let node = setup; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 1)
          throw new Error("Transparent setup ancestor");
      }
    }
    if (/\d+px × \d+px/.test(document.body.innerText)) throw new Error("Viewport overlay visible");
    if (
      document.querySelector(".am-composer-context, [data-onboarding-surface]") &&
      /(?:Codex|Claude) provider status/.test(document.body.innerText)
    )
      throw new Error("Developer provider toast in marketer mode");
  });
}

export async function applicationPage(context) {
  const application = async (page) => {
    await page.waitForURL((url) => url.protocol === "t3code-dev:", { timeout: 120000 });
    await page
      .locator('[data-sidebar="sidebar"], [data-onboarding-surface]')
      .first()
      .waitFor({ timeout: 120000 });
    return page;
  };
  const existing = context.pages().find((page) => page.url().startsWith("t3code-dev:"));
  if (existing) return application(existing);
  return Promise.any([
    ...context.pages().map(application),
    context.waitForEvent("page", { timeout: 120000 }).then(application),
  ]);
}
