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
  const result = { status: "success", tool: "site.audit" };
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
