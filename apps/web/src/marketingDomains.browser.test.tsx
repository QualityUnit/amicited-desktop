import { CloudFooter } from "./rpc/amicitedCloud";
import "./index.css";
import { page, userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import type { Connection } from "@amicited/cloud-client/model";
import { render } from "../test/render";
const state = vi.hoisted(() => ({
  connections: new Map<string, Connection>(),
  failSave: false,
  emptyDomains: false,
  requests: [] as Array<{
    label: string;
    projectId?: string;
    website?: string;
    workspaceRoot?: string;
  }>,
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: () => true,
}));
vi.mock("./state/environments", async (original) => ({
  ...(await original<typeof import("./state/environments")>()),
  usePrimaryEnvironmentId: () => "local",
  usePrimaryEnvironment: () => null,
}));
vi.mock("./localApi", async (original) => ({
  ...(await original<typeof import("./localApi")>()),
  createLocalApi: () => ({
    shell: { openExternal: async () => {} },
    dialogs: { pickFolder: async () => "/fixture/site" },
  }),
}));
vi.mock("./hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => async () => {} }));
vi.mock("./state/use-atom-command", () => ({
  useAtomCommand:
    (command: { label: string }) =>
    async ({
      input,
    }: {
      input?: {
        projectId?: string;
        sourceProjectId?: string;
        apiKey?: string;
        website?: string;
        workspaceRoot?: string;
      };
    }) => {
      state.requests.push({
        label: command.label,
        ...(input?.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.website ? { website: input.website } : {}),
      });
      if (command.label === "domains:inspect")
        return { _tag: "Success", value: { git: true, framework: "Next.js" } };
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
          ? (state.emptyDomains ? [] : ["a", "b"]).map((projectId) => ({
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
vi.mock("./state/use-orchestration-command", async () => {
  const { useAtomCommand } = await import("./state/use-atom-command");
  return { useOrchestrationCommand: useAtomCommand };
});
import { DomainMigration, DomainConnection, NewDomainDialog } from "./marketingDomains";
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
  await screen.getByRole("button", { name: "Connect", exact: true }).first().click();
  await page.getByText("Use an API key instead", { exact: true }).click();
  await page.getByLabelText("Workspace API key").first().fill("fixture-a");
  await page.getByRole("button", { name: "Connect with key", exact: true }).first().click();
  await page.getByRole("button", { name: "Start 7-day free trial", exact: true }).click();
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() =>
    expect(state.requests).toContainEqual({ label: "cloud:reset-access", projectId: "a" }),
  );
  await userEvent.keyboard("{Escape}");
  const reuse = screen.getByRole("button", {
    name: "Use the account connected to a.example",
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

it("reuses the saved migration project after a failed save and remount", async () => {
  state.requests.length = 0;
  state.failSave = true;
  state.emptyDomains = true;
  const key = "amicited.domain-migration.local.acme.com";
  localStorage.removeItem(key);
  localStorage.setItem("amicited.brand", JSON.stringify({ website: "acme.com", name: "Acme" }));
  try {
    {
      await using _screen = await render(<DomainMigration />);
      await vi.waitFor(() =>
        expect(state.requests.some((r) => r.label === "domains:save")).toBe(true),
      );
      await vi.waitFor(() => expect(localStorage.getItem(key)).toBe("created-domain"));
    }
    await using _screen = await render(<DomainMigration />);
    await vi.waitFor(() => expect(localStorage.getItem("amicited.brand")).toBeNull());
    expect(
      state.requests.filter((r) => r.label === "environment-data:projects:create-new"),
    ).toHaveLength(1);
    expect(state.requests.filter((r) => r.label === "domains:save")).toHaveLength(2);
  } finally {
    state.emptyDomains = false;
    localStorage.removeItem("amicited.brand");
    localStorage.removeItem(key);
  }
});

it("uses the chosen site folder as the T3 project workspaceRoot", async () => {
  state.emptyDomains = true;
  state.requests.length = 0;
  await using screen = await render(
    <NewDomainDialog open onOpenChange={() => {}} destination={EnvironmentId.make("local")} />,
  );
  await userEvent.fill(screen.getByLabelText("Website", { exact: true }), "site.example");
  await userEvent.click(screen.getByRole("combobox", { name: "CMS", exact: true }));
  await userEvent.click(page.getByRole("option", { name: /^Git-based site/ }));
  await userEvent.click(screen.getByRole("combobox", { name: "Site files", exact: true }));
  await userEvent.click(page.getByRole("option", { name: "Use a folder on this computer" }));
  await userEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  await expect.element(screen.getByText(/Detected Next.js/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Create domain", exact: true }));
  await vi.waitFor(() =>
    expect(state.requests).toContainEqual(
      expect.objectContaining({
        label: "environment-data:commands:project:create",
        workspaceRoot: "/fixture/site",
      }),
    ),
  );
  state.emptyDomains = false;
});
