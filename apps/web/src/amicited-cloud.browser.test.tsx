import "./index.css";

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

it("renders a compact result in the conversation and opens the full result", async () => {
  const { CompactMarketingResult } = await import("@amicited/ui-marketing");
  const open = vi.fn();
  await using screen = await render(
    <CompactMarketingResult
      result={{
        id: "audit",
        tool: "seo.site.audit",
        input: {},
        startedAt: "2026-11-06",
        durationMs: 1,
        status: "success",
        output: { score: 41, findings: [{ title: "Missing title", status: "fail" }] },
      }}
      open={open}
    />,
  );
  await expect.element(screen.getByText("41/100")).toBeVisible();
  await expect.element(screen.getByText("Missing title")).toBeVisible();
  await screen.getByRole("button", { name: "Open full result" }).click();
  expect(open).toHaveBeenCalledOnce();
});
it("attaches the full tool result when asking AI", async () => {
  const { MarketingResult } = await import("@amicited/ui-marketing");
  const fix = vi.fn(async (_prompt: string) => {});
  await using screen = await render(
    <MarketingResult
      result={{
        id: "audit",
        tool: "seo.site.audit",
        input: { url: "https://example.com" },
        startedAt: "2026-11-06",
        durationMs: 1,
        status: "success",
        output: { score: 41 },
      }}
      fix={fix}
    />,
  );
  await screen.getByRole("button", { name: "Ask AI about this" }).click();
  expect(fix.mock.calls[0]?.[0]).toContain("41");
});
it("keeps chat history and secondary navigation available when collapsed", async () => {
  const navigate = vi.fn();
  localStorage.removeItem("amicited.rail-collapsed");
  try {
    await using screen = await render(
      <MarketingShell
        path="/home"
        navigate={navigate}
        history={
          <a
            href="/env/chat"
            onClick={(e) => {
              e.preventDefault();
              navigate("/env/chat");
            }}
          >
            Campaign audit
          </a>
        }
      >
        <h1>Chat</h1>
      </MarketingShell>,
    );
    await screen.getByRole("link", { name: "Campaign audit" }).click();
    expect(navigate).toHaveBeenCalledWith("/env/chat");
    await screen.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.element(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await screen.getByRole("button", { name: "New chat" }).click();
    expect(navigate).toHaveBeenCalledWith("/new");
  } finally {
    localStorage.removeItem("amicited.rail-collapsed");
  }
});

it("opens result inputs instead of the remembered brand form", async () => {
  const { ToolForm } = await import("@amicited/ui-marketing");
  sessionStorage.setItem(
    "amicited.last-result",
    JSON.stringify({
      id: "edit",
      tool: "seo.site.audit",
      input: { url: "https://competitor.example", alphabet: false, competitors: ["One", "Two"] },
      startedAt: "2026-11-06",
      durationMs: 1,
      status: "success",
      output: { score: 41 },
    }),
  );
  sessionStorage.setItem(
    "amicited.inputs.seo.site.audit",
    JSON.stringify({ url: "https://wrong.example" }),
  );
  try {
    await using screen = await render(
      <ToolForm
        tool={{
          name: "seo.site.audit",
          title: "Website audit",
          description: "Check",
          pack: "seo",
          cost: "free",
          timeoutMs: 1000,
          schedulable: false,
          sideEffects: "none",
          keywords: [],
          inputSchema: {
            properties: {
              url: { type: "string" },
              alphabet: { type: "boolean" },
              competitors: { type: "array" },
            },
          },
          outputSchema: {},
        }}
        run={vi.fn()}
      />,
    );
    await screen.getByRole("button", { name: "Edit inputs" }).click();
    await expect
      .element(screen.getByLabelText("url", { exact: true }))
      .toHaveValue("https://competitor.example");
    await expect.element(screen.getByLabelText("alphabet", { exact: true })).toHaveValue("false");
    await expect
      .element(screen.getByLabelText("competitors", { exact: true }))
      .toHaveValue("One, Two");
  } finally {
    sessionStorage.removeItem("amicited.last-result");
    sessionStorage.removeItem("amicited.inputs.seo.site.audit");
  }
});

it("renders an inspectable failure and readable dark tool surfaces", async () => {
  const { MarketingCallState, ToolsGrid } = await import("@amicited/ui-marketing");
  document.documentElement.classList.add("dark");
  try {
    await using screen = await render(
      <MarketingShell path="/tools" navigate={() => {}}>
        <MarketingCallState status="completed" output="Permission refused" />
        <ToolsGrid
          navigate={() => {}}
          selectedPack="seo"
          tools={[
            {
              name: "seo.site.audit",
              title: "Audit fixture",
              description: "Read this",
              pack: "seo",
              cost: "free",
              timeoutMs: 1000,
              schedulable: false,
              sideEffects: "none",
              keywords: [],
              inputSchema: {},
              outputSchema: {},
            },
          ]}
        />
      </MarketingShell>,
    );
    await expect.element(screen.getByText("Could not check", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Permission refused", { exact: true }).first())
      .toBeVisible();
    await screen.getByText("Show details").click();
    await expect
      .element(screen.getByText("Permission refused", { exact: true }).last())
      .toBeVisible();
    const card = document.querySelector<HTMLAnchorElement>(".am-tool-grid > a")!;
    expect(getComputedStyle(card).backgroundColor).toBe("rgb(31, 41, 55)");
    expect(getComputedStyle(card).color).not.toBe(getComputedStyle(card).backgroundColor);
  } finally {
    document.documentElement.classList.remove("dark");
  }
});

it("routes tool categories and cards through the navigation bridge", async () => {
  const { ToolsGrid } = await import("@amicited/ui-marketing");
  const navigate = vi.fn();
  await using screen = await render(
    <ToolsGrid tools={[]} selectedPack="seo" navigate={navigate} />,
  );
  await screen.getByRole("link", { name: "Content tools", exact: true }).click();
  expect(navigate).toHaveBeenCalledWith("/tools?category=content");
});
it("keeps report context scoped in hash-routed clients and clears after dispatch", async () => {
  const { saveMarketingReport, readMarketingReport, clearMarketingReport } =
    await import("./marketingContext");
  const first = { environmentId: "local", threadId: "first" };
  const second = { environmentId: "local", threadId: "second" };
  try {
    saveMarketingReport(first, { id: "one" });
    saveMarketingReport(second, { id: "two" });
    expect(readMarketingReport(first)).toEqual({ id: "one" });
    clearMarketingReport(first);
    expect(readMarketingReport(first)).toBeNull();
    expect(readMarketingReport(second)).toEqual({ id: "two" });
  } finally {
    clearMarketingReport(first);
    clearMarketingReport(second);
  }
});
