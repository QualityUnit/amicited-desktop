import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vite-plus/test";
import {
  AmicitedConnectPanel,
  AmicitedConnectedBadge,
  AmicitedUpsellCard,
  type CloudUi,
} from "./index.tsx";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
const ui: CloudUi = {
  Button: (props) => createElement("button", props),
  Input: (props) => createElement("input", props),
};
const disconnected = { state: "disconnected" } as const;
const actions = {
  connectOAuth: async () => disconnected,
  connectApiKey: async () => disconnected,
  disconnect: async () => disconnected,
};
it("renders accessible account-optional connect controls and actionable plan errors", () => {
  const html = renderToStaticMarkup(
    <AmicitedConnectPanel
      ui={ui}
      actions={actions}
      connection={{
        state: "error",
        kind: "plan_required",
        message: "This tool needs a trial or paid plan.",
      }}
      onChange={() => {}}
      openExternal={() => {}}
    />,
  );
  expect(html).toContain("Your local tools always work without an account");
  expect(html).toContain("Start 7-day free trial");
  expect(html).toContain('type="password"');
  expect(html).not.toContain("Bearer");
});
it("hides disconnected summaries and failed-result offers, and renders only supplied headline data", () => {
  expect(
    renderToStaticMarkup(
      <AmicitedConnectedBadge
        ui={ui}
        connection={disconnected}
        domains={[]}
        reportLink={async () => ""}
        openExternal={() => {}}
      />,
    ),
  ).toBe("");
  const html = renderToStaticMarkup(
    <AmicitedConnectedBadge
      ui={ui}
      connection={{ state: "connected", workspace: "Brand", scopes: [] }}
      domains={["example.com"]}
      headlines={[{ label: "Visibility", value: "23%" }]}
      reportLink={async () => "https://app.flowhunt.io/"}
      openExternal={() => {}}
    />,
  );
  expect(html).toContain("example.com");
  expect(html).toContain("23%");
  const storage = { getItem: () => null, setItem: () => {} };
  expect(
    renderToStaticMarkup(
      <AmicitedUpsellCard
        ui={ui}
        result={{ tool: "site.audit", status: "error" }}
        gate={createUpsellGate(storage, storage)}
        openExternal={() => {}}
        onConnect={() => {}}
      />,
    ),
  ).toBe("");
});
