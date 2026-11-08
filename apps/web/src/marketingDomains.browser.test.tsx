import { CloudFooter } from "./rpc/amicitedCloud";
import "./index.css";
import { page } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import type { Connection } from "@amicited/cloud-client/model";
import { render } from "../test/render";
const state = vi.hoisted(() => ({
  connections: new Map<string, Connection>(),
  failSave: false,
  requests: [] as Array<{ label: string; projectId?: string; website?: string }>,
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: () => true,
}));
vi.mock("./state/environments", async (original) => ({
  ...(await original<typeof import("./state/environments")>()),
  usePrimaryEnvironmentId: () => "local",
}));
vi.mock("./hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => async () => {} }));
vi.mock("./state/use-atom-command", () => ({
  useAtomCommand:
    (command: { label: string }) =>
    async ({
      input,
    }: {
      input?: { projectId?: string; sourceProjectId?: string; apiKey?: string; website?: string };
    }) => {
      state.requests.push({
        label: command.label,
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.website ? { website: input.website } : {}),
      });
      if (command.label === "environment-data:projects:create-new")
        return {
          _tag: "Success",
          value: { projectId: "created-domain", workspaceRoot: "/unused" },
        };
      if (command.label === "domains:save") {
        if (state.failSave) {
          state.failSave = false;
          return { _tag: "Failure" };
        }
        return {
          _tag: "Success",
          value: {
            projectId: input?.projectId,
            hostname: input?.website,
            brand: "Acme",
            connectionRef: input?.projectId,
          },
        };
      }
      const value =
        command.label === "domains:list"
          ? ["a", "b"].map((projectId) => ({
              projectId,
              hostname: `${projectId}.example`,
              brand: projectId,
              connectionRef: projectId,
            }))
          : (() => {
              const projectId = input?.projectId ?? "";
              if (command.label === "domains:reuse")
                state.connections.set(
                  projectId,
                  state.connections.get(input?.sourceProjectId ?? "")!,
                );
              if (input?.apiKey)
                state.connections.set(projectId, {
                  state: "connected",
                  workspace: "Fixture workspace",
                  scopes: [],
                });
              return state.connections.get(projectId) ?? { state: "disconnected" };
            })();
      return { _tag: "Success", value };
    },
}));
import { DomainConnection, NewDomainDialog } from "./marketingDomains";
it("offers account reuse immediately after another domain connects", async () => {
  state.connections.clear();
  state.requests.length = 0;
  const destination = EnvironmentId.make("local");
  await using screen = await render(
    <>
      <DomainConnection
        destination={destination}
        domain={{ projectId: "a", hostname: "a.example", brand: "A", connectionRef: "a" }}
      />
      <DomainConnection
        destination={destination}
        domain={{ projectId: "b", hostname: "b.example", brand: "B", connectionRef: "b" }}
      />
    </>,
  );
  await screen.getByText("Use an API key instead", { exact: true }).first().click();
  await screen.getByLabelText("Workspace API key").first().fill("fixture-a");
  await screen.getByRole("button", { name: "Connect with key", exact: true }).first().click();
  const reuse = screen.getByRole("button", {
    name: "Use the same AmICited account (Fixture workspace)",
    exact: true,
  });
  await expect.element(reuse).toBeVisible();
  await reuse.click();
  await vi.waitFor(() =>
    expect(state.requests).toContainEqual({ label: "domains:reuse", projectId: "b" }),
  );
});

it("normalizes a new domain and retries metadata saving without creating a second project", async () => {
  state.requests.length = 0;
  state.failSave = true;
  const changed = vi.fn();
  await using _screen = await render(<NewDomainDialog open onOpenChange={changed} />);
  await page
    .getByRole("textbox", { name: "Website", exact: true })
    .fill("https://WWW.Acme.com/about");
  await page.getByRole("button", { name: "Create domain", exact: true }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Create domain", exact: true }).click();
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(false));
  expect(
    state.requests.filter((request) => request.label === "environment-data:projects:create-new"),
  ).toHaveLength(1);
  expect(state.requests.filter((request) => request.label === "domains:save")).toEqual([
    { label: "domains:save", projectId: "created-domain", website: "acme.com" },
    { label: "domains:save", projectId: "created-domain", website: "acme.com" },
  ]);
});

it("creates a domain before connecting a chat that has no domain", async () => {
  state.requests.length = 0;
  state.failSave = false;
  const key = "amicited.cloud.upsell";
  const previous = localStorage.getItem(key);
  const previousSession = sessionStorage.getItem(key);
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  try {
    await using screen = await render(
      <CloudFooter
        result={{
          id: "no-domain",
          tool: "seo.site.audit",
          status: "success",
          output: { score: 75 },
        }}
      />,
    );
    await screen.getByRole("button", { name: "Connect AmICited (free)", exact: true }).click();
    await expect
      .element(page.getByRole("dialog", { name: "New domain", exact: true }))
      .toBeVisible();
    expect(
      state.requests.some(
        (request) => request.label === "cloud:oauth" || request.label === "domains:connection",
      ),
    ).toBe(false);
  } finally {
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
    if (previousSession === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, previousSession);
  }
});
