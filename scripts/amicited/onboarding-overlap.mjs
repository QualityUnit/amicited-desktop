// Continue onboarding-capture.mjs on a native window with a domain and Replay (dev) configured.
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
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("t3code-dev:"));
  page.setDefaultTimeout(120000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Overlay.setShowViewportSizeOnResize", { show: false });
  const index = [];
  const capture = async (name, description) => {
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.screenshot({ animations: "disabled" });
    await page.screenshot({ animations: "disabled", path: NodePath.join(out, `${name}.png`) });
    index.push(`- ${name}.png: ${description}`);
    NodeFS.writeFileSync(NodePath.join(out, "overlap-index.md"), index.join("\n") + "\n");
  };
  const matrix = async (state) => {
    for (const width of [860, 1100, 1344, 1710]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1016,
        deviceScaleFactor: 2,
        mobile: false,
      });
      await capture(
        `context-${state}-${width}`,
        `${state} with a long domain, ${width} CSS pixels; current build.`,
      );
    }
  };
  await page.evaluate(async () => {
    const { threadEnvironment } = await import("/src/state/threads.ts");
    const { appAtomRegistry } = await import("/src/rpc/atomRegistry.ts");
    const { readPrimaryEnvironmentId } = await import("/src/state/environments.ts");
    const { cache } = await import("/src/marketingDomainStore.ts");
    const environmentId = readPrimaryEnvironmentId();
    const projectId = cache.get(environmentId)[0].projectId;
    for (let i = 1; i <= 12; i++) {
      const threadId = crypto.randomUUID();
      const result = await threadEnvironment.create.run(appAtomRegistry, {
        environmentId,
        input: {
          threadId,
          projectId,
          title: `Campaign fixture ${i}`,
          modelSelection: { instanceId: "devReplay", model: "showcase" },
          runtimeMode: "approval-required",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
        },
      });
      if (result._tag !== "Success") throw new Error("Could not create fixture chat");
      if (i === 1)
        await threadEnvironment.settle.run(appAtomRegistry, { environmentId, input: { threadId } });
    }
  });
  await matrix("empty");
  await page.evaluate(() => window.t3dev.replay("marketing-readability-approval"));
  await page.getByRole("group", { name: "Marketing approval" }).waitFor();
  await matrix("approval");
  await page
    .getByTestId("composer-editor")
    .fill("After this, draft a LinkedIn post about our website.");
  await page.getByTestId("composer-editor").press("Enter");
  await matrix("approval-queue");
  await capture(
    "sidebar-many-chats",
    "Long domain with more than ten persisted chats, Working and Settled shelves.",
  );
  await page.getByRole("button", { name: "Don't allow", exact: true }).click();
  const queuedThread = await page.evaluate(() => window.t3dev.replay("showcase"));
  await page.getByRole("button", { name: "Allow once", exact: true }).waitFor();
  await page.evaluate(async (threadId) => {
    const { threadEnvironment } = await import("/src/state/threads.ts");
    const { appAtomRegistry } = await import("/src/rpc/atomRegistry.ts");
    const { readPrimaryEnvironmentId } = await import("/src/state/environments.ts");
    await threadEnvironment.startTurn.run(appAtomRegistry, {
      environmentId: readPrimaryEnvironmentId(),
      input: {
        threadId,
        message: {
          messageId: crypto.randomUUID(),
          role: "user",
          text: "Then draft a LinkedIn post for our brand.",
          attachments: [],
        },
        modelSelection: { instanceId: "devReplay", model: "showcase" },
        runtimeMode: "approval-required",
        interactionMode: "default",
        dispatchMode: "queue",
      },
    });
  }, queuedThread);
  await matrix("queued");
} finally {
  await browser.close();
}
