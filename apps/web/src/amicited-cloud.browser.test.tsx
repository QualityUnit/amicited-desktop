import "./index.css";
import { page } from "vite-plus/test/browser";
import { MarketingShell } from "@amicited/ui-marketing";
import { AmicitedConnectPanel, AmicitedUpsellCard } from "@amicited/ui-cloud";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../test/render";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
const ui = { Button, Input };
it("offers a successful result once, persists Not now, and opens the real signup", async () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  const gate = createUpsellGate(storage, storage);
  const open = vi.fn();
  const result = {
    status: "success",
    tool: "site.audit",
    output: { status: "checked", score: 75 },
  };
  await using screen = await render(
    <AmicitedUpsellCard
      ui={ui}
      result={result}
      gate={gate}
      openExternal={open}
      onConnect={() => {}}
    />,
  );
  await screen.getByRole("button", { name: "Start 7-day free trial" }).click();
  expect(open).toHaveBeenCalledWith(
    "https://app.flowhunt.io/sign-in?app=amicited&plan=pro&interval=month",
  );
  await screen.getByRole("button", { name: "Not now", exact: true }).click();
  await expect.element(screen.getByRole("complementary")).not.toBeInTheDocument();
  expect(map.get("amicited.cloud.upsell")).toContain("snoozedUntil");
});
it("validates a pasted key and clears it after connecting", async () => {
  const connectApiKey = vi.fn(
    async () => ({ state: "connected", workspace: "Brand", scopes: [] }) as const,
  );
  const onChange = vi.fn();
  await using screen = await render(
    <AmicitedConnectPanel
      ui={ui}
      connection={{ state: "disconnected" }}
      actions={{
        connectApiKey,
        connectOAuth: async () => ({ state: "disconnected" }),
        disconnect: async () => ({ state: "disconnected" }),
      }}
      onChange={onChange}
      openExternal={() => {}}
    />,
  );
  await screen.getByText("Use an API key instead", { exact: true }).click();
  await screen.getByLabelText("Workspace API key").fill("fixture-key");
  await screen.getByRole("button", { name: "Connect with key", exact: true }).click();
  await vi.waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({ state: "connected", workspace: "Brand", scopes: [] }),
  );
  await expect.element(screen.getByLabelText("Workspace API key")).toHaveValue("");
});

it("scopes marketer tokens to the shell and removes them in developer mode", async () => {
  await using screen = await render(
    <MarketingShell path="/home" navigate={() => {}}>
      <h1>Workspace</h1>
    </MarketingShell>,
  );
  await expect.element(screen.getByRole("heading", { name: "Workspace" })).toBeVisible();
  const shell = document.querySelector("[data-amicited-shell]");
  expect(shell).not.toBeNull();
  expect(getComputedStyle(shell!).getPropertyValue("--primary").trim()).toBe("#3b5cff");
  document.documentElement.classList.add("dark");
  expect(getComputedStyle(shell!).getPropertyValue("--ai-bg").trim()).toBe("#111928");
  document.documentElement.classList.remove("dark");
  await screen.rerender(
    <MarketingShell mode="developer" path="/home" navigate={() => {}}>
      <h1>Developer workspace</h1>
    </MarketingShell>,
  );
  expect(document.querySelector("[data-amicited-shell]")).toBeNull();
});

it("opens AmICited from the first-win offer on welcome", async () => {
  const { MarketingNavigationBridge } = await import("./marketingNavigation");
  const { FirstRun, ResultFooterContext } = await import("@amicited/ui-marketing");
  const storage = new Map<string, string>();
  const fixtureStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  const gate = createUpsellGate(fixtureStorage, fixtureStorage);
  const result = {
    id: "audit",
    tool: "seo.site.audit",
    input: { url: "https://example.com" },
    status: "success",
    startedAt: "2026-11-06",
    durationMs: 1,
    output: { status: "checked", score: 50 },
  } as const;
  await using screen = await render(
    <MarketingNavigationBridge>
      <ResultFooterContext
        value={() => (
          <AmicitedUpsellCard
            ui={ui}
            result={result}
            gate={gate}
            openExternal={() => {}}
            onConnect={() =>
              window.dispatchEvent(
                new CustomEvent("amicited-navigate", { detail: "/marketing-settings" }),
              )
            }
          />
        )}
      >
        <FirstRun
          subscriptions={null}
          prepare={async () => {}}
          check={async () => result}
          skip={() => {}}
          fix={async () => {}}
        />
      </ResultFooterContext>
    </MarketingNavigationBridge>,
    { router: "/welcome" },
  );
  await screen.getByRole("textbox", { name: "Website URL" }).fill("example.com");
  await screen.getByRole("button", { name: "Continue", exact: true }).click();
  await screen.getByRole("button", { name: "I already have AmICited", exact: true }).click();
  await vi.waitFor(() =>
    expect(screen.router?.state.location.pathname).toBe("/marketing-settings"),
  );
});

it("keeps Home Ask until an assistant is ready, then sends the same prompt", async () => {
  const { Home } = await import("@amicited/ui-marketing");
  const startTask = vi.fn(async () => {});
  await using screen = await render(<Home startTask={startTask} assistantsLoading />);
  await expect.element(screen.getByRole("button", { name: "Connect an assistant" })).toBeDisabled();
  await expect
    .element(screen.getByText("Connect an assistant first", { exact: true }))
    .not.toBeInTheDocument();
  await screen.rerender(<Home startTask={startTask} />);
  await screen.getByLabelText("Ask your AI assistant").fill("Plan my campaign");
  await screen.getByRole("button", { name: "Connect an assistant" }).click();
  await expect
    .element(screen.getByLabelText("Ask your AI assistant"))
    .toHaveValue("Plan my campaign");
  expect(startTask).not.toHaveBeenCalled();
  await screen.rerender(<Home startTask={startTask} assistantName="Claude" />);
  await expect
    .element(screen.getByRole("alert"))
    .not.toHaveTextContent("Connect Claude or ChatGPT to send this task");
  await expect
    .element(screen.getByText("Claude will start working on this", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Send task" }).click();
  expect(startTask).toHaveBeenCalledWith("Plan my campaign");
});

it.each([
  { firstWin: false, hidden: false, visible: false },
  { firstWin: true, hidden: false, visible: true },
  { firstWin: true, hidden: true, visible: false },
  { firstWin: true, hidden: false, snoozed: true, visible: false },
  { firstWin: true, hidden: false, connected: true, visible: false },
])(
  "gates Tools promotions with first win $firstWin and hidden $hidden",
  async ({ firstWin, hidden, visible, snoozed, connected }) => {
    const { CloudToolPromotions } = await import("./rpc/amicitedCloud");
    localStorage.setItem("amicited.first-win", String(firstWin));
    localStorage.setItem(
      "amicited.cloud.upsell",
      JSON.stringify({ dismissed: hidden, snoozedUntil: snoozed ? Number.MAX_SAFE_INTEGER : 0 }),
    );
    try {
      await using screen = await render(
        <CloudToolPromotions
          connection={
            connected
              ? { state: "connected", workspace: "Acme", scopes: [] }
              : { state: "disconnected" }
          }
        />,
      );
      if (visible) {
        await expect
          .element(screen.getByRole("heading", { name: "Works better with AmICited" }))
          .toBeVisible();
        await screen.getByRole("button", { name: "Daily AI visibility tracking →" }).click();
        await expect
          .element(screen.getByRole("button", { name: "Start 7-day free trial" }))
          .toBeVisible();
      } else {
        await expect
          .element(screen.getByRole("heading", { name: "Works better with AmICited" }))
          .not.toBeInTheDocument();
        await expect
          .element(screen.getByRole("button", { name: "Start 7-day free trial" }))
          .not.toBeInTheDocument();
      }
    } finally {
      localStorage.removeItem("amicited.first-win");
      localStorage.removeItem("amicited.cloud.upsell");
    }
  },
);

it("ranks visibility brands by measured mentions and uses the same share precision", async () => {
  const { MarketingResult } = await import("@amicited/ui-marketing");
  await using screen = await render(
    <MarketingResult
      result={{
        id: "visibility",
        tool: "ai.visibility.check",
        input: { brand: "Acme" },
        status: "success",
        startedAt: "2026-11-06",
        durationMs: 1,
        output: {
          status: "checked",
          summary: {
            mentioned: 1,
            answered: 2,
            shareOfVoice: 33,
            competitors: [{ brand: "Contoso", answers: 2 }],
          },
        },
      }}
    />,
  );
  const shares = screen.getByText("33.3%", { exact: true });
  await expect.element(shares.first()).toBeVisible();
  await expect.element(shares.last()).toBeVisible();
  expect(
    [...document.querySelectorAll('[role="listitem"] > div > span.min-w-0')].map(
      (row) => row.textContent,
    ),
  ).toEqual(["Contoso", "Acme"]);
});

it.each([false, true])(
  "edits retained inputs and reruns after unavailable=$unavailable",
  async (unavailable) => {
    const { ToolForm } = await import("@amicited/ui-marketing");
    sessionStorage.clear();
    const run = vi.fn(async (input: unknown) => ({
      id: "repeat",
      tool: "content.readability",
      input,
      status: "success" as const,
      startedAt: "2026-11-06",
      durationMs: 1,
      output:
        unavailable && run.mock.calls.length === 1 ? { status: "needs_provider" } : { words: 12 },
    }));
    await using screen = await render(
      <ToolForm
        tool={{
          keywords: [],
          outputSchema: {},
          cost: "free",
          timeoutMs: 1000,
          schedulable: false,
          sideEffects: "none",
          name: "content.readability",
          title: "Readability check",
          description: "Check your copy",
          pack: "content",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        }}
        run={run}
      />,
    );
    await screen.getByRole("textbox", { name: "text", exact: true }).fill("First copy");
    await screen.getByRole("button", { name: "Run check", exact: true }).click();
    await screen.getByRole("button", { name: "Edit inputs", exact: true }).click();
    await expect
      .element(screen.getByRole("textbox", { name: "text", exact: true }))
      .toHaveValue("First copy");
    await screen.getByRole("textbox", { name: "text", exact: true }).fill("Revised copy");
    await screen.getByRole("button", { name: "Run check", exact: true }).click();
    await expect.element(screen.getByText("12", { exact: true })).toBeVisible();
    expect(run.mock.calls.map(([input]) => input)).toEqual([
      { text: "First copy" },
      { text: "Revised copy" },
    ]);
    await screen.getByRole("button", { name: "Run again", exact: true }).click();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    expect(run.mock.calls[2]?.[0]).toEqual({ text: "Revised copy" });
    await screen.getByRole("button", { name: "Edit inputs", exact: true }).click();
    await expect
      .element(screen.getByRole("textbox", { name: "text", exact: true }))
      .toHaveValue("Revised copy");
  },
);

it("hands the audit website and finding context to AI and labels all-pass results", async () => {
  const { MarketingResult } = await import("@amicited/ui-marketing");
  const fix = vi.fn(async () => {});
  const result = {
    id: "audit-context",
    tool: "seo.site.audit",
    input: { url: "https://example.com" },
    status: "success" as const,
    startedAt: "2026-11-06",
    durationMs: 1,
    output: {
      findings: [
        {
          title: "Missing title",
          status: "fail",
          why: "Help readers find you",
          fix: "Write a useful title",
        },
      ],
    },
  };
  await using screen = await render(<MarketingResult result={result} fix={fix} />);
  await screen.getByRole("button", { name: "Fix with AI →", exact: true }).first().click();
  expect(fix).toHaveBeenCalledWith(
    "Help me fix this on https://example.com: Missing title\nHelp readers find you\nWrite a useful title",
  );
  await screen.rerender(
    <MarketingResult
      result={{ ...result, output: { findings: [{ title: "Secure", status: "pass" }] } }}
      fix={fix}
    />,
  );
  await expect.element(screen.getByRole("heading", { name: "Checks passing" })).toBeVisible();
  await expect.element(screen.getByText("0 unavailable")).not.toBeInTheDocument();
});

it("keeps the Tools disclosure across mounts and marks the hash-selected pack", async () => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(1344, 1016);
  const { MarketingShell } = await import("@amicited/ui-marketing");
  localStorage.removeItem("amicited.tools-open");
  localStorage.removeItem("amicited.rail-collapsed");
  try {
    await using screen = await render(
      <MarketingShell path="/tools" hash="content" navigate={() => {}}>
        Tools
      </MarketingShell>,
    );
    await expect
      .element(screen.getByRole("link", { name: "Content tools", exact: true }))
      .toHaveAttribute("aria-current", "page");
    await screen.getByRole("button", { name: "Tool packs", exact: true }).click();
    expect(document.querySelector("#am-tools-group")).toHaveAttribute("hidden");
    await screen.rerender(
      <MarketingShell key="remount" path="/tools" hash="content" navigate={() => {}}>
        Tools
      </MarketingShell>,
    );
    await expect
      .element(screen.getByRole("button", { name: "Tool packs", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
    await screen.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect
      .element(screen.getByRole("link", { name: "Content tools", exact: true }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Expand sidebar" }).click();
    expect(document.querySelector("#am-tools-group")).toHaveAttribute("hidden");
    await screen.getByRole("button", { name: "Tool packs", exact: true }).click();
    await expect
      .element(screen.getByRole("link", { name: "Content tools", exact: true }))
      .toBeVisible();
  } finally {
    await page.viewport(viewport.width, viewport.height);
    localStorage.removeItem("amicited.rail-collapsed");
    localStorage.removeItem("amicited.tools-open");
  }
});
it("includes visibility inputs, prompts and findings in the AI handoff", async () => {
  const { MarketingResult } = await import("@amicited/ui-marketing");
  const fix = vi.fn(async (_prompt: string) => {});
  await using screen = await render(
    <MarketingResult
      fix={fix}
      result={{
        id: "visibility-context",
        tool: "ai.visibility.check",
        status: "success",
        durationMs: 1,
        startedAt: "2026-11-06",
        input: { brand: "Acme", website: "https://example.com" },
        output: {
          summary: { answered: 1, mentioned: 0 },
          answers: [
            {
              prompt: "Best garden tools?",
              mentioned: false,
              excerpt: "Contoso only",
              status: "answered",
              position: null,
              competitorsMentioned: ["Contoso"],
              citations: [],
            },
          ],
        },
      }}
    />,
  );
  await screen.getByRole("tab", { name: /Answers checked/ }).click();
  await expect
    .element(screen.getByRole("heading", { name: "Answers checked in this run" }))
    .toBeVisible();
  await screen.getByText("Show full answer · Why / How", { exact: true }).click();
  await expect.element(screen.getByText("Contoso only", { exact: true }).last()).toBeVisible();
  await screen.getByRole("button", { name: "Fix with AI →", exact: true }).first().click();
  expect(fix.mock.calls[0]?.[0]).toContain("Acme");
  expect(fix.mock.calls[0]?.[0]).toContain("https://example.com");
  expect(fix.mock.calls[0]?.[0]).toContain("Best garden tools?");
  expect(fix.mock.calls[0]?.[0]).toContain("Contoso only");
});

it("labels collapsed navigation when focused", async () => {
  const { KitTooltip, KitButton } = await import("./marketing");
  const { MarketingUiContext } = await import("@amicited/ui-marketing");
  const { Textarea } = await import("./components/ui/textarea");
  localStorage.setItem("amicited.rail-collapsed", "true");
  await using screen = await render(
    <MarketingUiContext
      value={{
        Button: KitButton,
        Input: ({ size: _size, ...props }) => <Input nativeInput {...props} />,
        Textarea,
        Tooltip: KitTooltip,
      }}
    >
      <MarketingShell path="/home" navigate={() => {}}>
        <p>Workspace</p>
      </MarketingShell>
    </MarketingUiContext>,
  );
  await screen.getByRole("link", { name: "Tasks", exact: true }).element().focus();
  await expect.element(page.getByRole("tooltip")).toHaveTextContent("Tasks");
  localStorage.removeItem("amicited.rail-collapsed");
});

it("opens marketer search from the sidebar and shortcut and follows a result", async () => {
  const { MarketingSearchContext } = await import("@amicited/ui-marketing");
  const navigate = vi.fn();
  await using screen = await render(
    <MarketingSearchContext
      value={[
        { title: "Website health audit", href: "/tools/seo.site.audit", kind: "Tool" },
        {
          title: "Recent visibility check",
          href: "/tools/ai.visibility.check",
          kind: "Recent result",
        },
        { title: "Write a launch brief", href: "/local/task", kind: "Task" },
      ]}
    >
      <MarketingShell path="/home" navigate={navigate}>
        <p>Home</p>
      </MarketingShell>
    </MarketingSearchContext>,
  );
  await screen.getByRole("button", { name: "Search", exact: true }).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await screen.getByRole("link", { name: "Website health audit Tool" }).click();
  expect(navigate).toHaveBeenCalledWith("/tools/seo.site.audit");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await screen.getByRole("searchbox").fill("launch");
  await expect
    .element(screen.getByRole("link", { name: "Website health audit Tool" }))
    .not.toBeInTheDocument();
  await screen.getByRole("link", { name: "Write a launch brief Task" }).click();
  expect(navigate).toHaveBeenCalledWith("/local/task");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  await screen.getByRole("link", { name: "Recent visibility check Recent result" }).click();
  expect(navigate).toHaveBeenCalledWith("/tools/ai.visibility.check");
});
