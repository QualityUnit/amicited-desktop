import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";
import { assertCaptureReady, applicationPage } from "./onboarding-proof.mjs";
const root = NodePath.resolve(import.meta.dirname, "../..");
const { chromium } = NodeModule.createRequire(NodePath.join(root, "apps/desktop/package.json"))(
  "playwright-core",
);
const out = NodePath.resolve(process.argv[2] ?? ".amicited-shots/r50/onboarding");
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.DEBUG_PORT ?? 9333}`);
try {
  const context = browser.contexts()[0];
  const page = await applicationPage(context);
  page.setDefaultTimeout(30000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1344,
    height: 1016,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await page.evaluate(async () => {
    const { completeOnboarding } = await import("/src/onboarding/firstRun.ts");
    await completeOnboarding();
    localStorage.setItem("amicited.workspace-mode", "developer");
    window.dispatchEvent(new Event("amicited-mode"));
    window.location.hash = "/welcome";
  });
  await page.getByRole("heading", { name: "Connect your computers", exact: true }).waitFor();
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await assertCaptureReady(page, cdp);
    await page.screenshot({
      path: NodePath.join(out, `developer-welcome${dark ? "-dark" : ""}.png`),
    });
  }
  await page.evaluate(() => {
    window.location.hash = "/settings/general";
  });
  await page.getByText("General", { exact: true }).first().waitFor();
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await assertCaptureReady(page, cdp);
    await page.screenshot({
      path: NodePath.join(out, `developer-settings${dark ? "-dark" : ""}.png`),
    });
  }
  await page.evaluate(() => {
    localStorage.setItem("amicited.workspace-mode", "marketer");
    window.dispatchEvent(new Event("amicited-mode"));
    window.location.hash = "/home";
  });
  NodeFS.writeFileSync(
    NodePath.join(out, "comparison.html"),
    `<!doctype html><meta charset="utf-8"><title>T3 surface comparison</title><style>body{font:14px system-ui;margin:0}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%}h2{font-size:16px}</style>${[
      false,
      true,
    ]
      .map((dark) => {
        const d = dark ? "-dark" : "";
        return `<section><div><h2>AmICited assistant setup</h2><img src="${out}/03-assistants${d}.png"></div><div><h2>T3 developer welcome</h2><img src="${out}/developer-welcome${d}.png"></div><div><h2>AmICited website setup</h2><img src="${out}/06-domain${d}.png"></div><div><h2>T3 developer settings</h2><img src="${out}/developer-settings${d}.png"></div></section>`;
      })
      .join("")}`,
  );
} finally {
  await browser.close();
}
