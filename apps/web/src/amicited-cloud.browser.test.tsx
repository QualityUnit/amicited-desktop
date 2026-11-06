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
  expect(getComputedStyle(shell!).getPropertyValue("--ai-bg").trim()).toBe("#11151e");
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
