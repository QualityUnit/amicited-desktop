import { CloudFooter } from "./rpc/amicitedCloud";
import "./index.css";
import { page, userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import type { Connection } from "@amicited/cloud-client/model";
import { render } from "../test/render";
const state = vi.hoisted(() => ({
  clonePhase: "done" as "done" | "failed" | null,
  connections: new Map<string, Connection>(),
  failSave: false,
  emptyDomains: false,
  requests: [] as Array<{
    label: string;
    projectId?: string;
    website?: string;
    workspaceRoot?: string;
    remoteUrl?: string;
    destinationPath?: string;
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
  useEnvironment: () => null,
}));
vi.mock("./state/projectClones", async (original) => ({
  ...(await original<typeof import("./state/projectClones")>()),
  silenceProjectCloneToasts: () => {},
  useProjectClone: (ref: unknown) =>
    ref && state.clonePhase ? { phase: state.clonePhase, percent: 100 } : null,
}));
vi.mock("./state/entities", async (original) => ({
  ...(await original<typeof import("./state/entities")>()),
  useServerConfigs: () => new Map([["local", { newProjectsRoot: "/fixture/clones" }]]),
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
        remoteUrl?: string;
        destinationPath?: string;
      };
    }) => {
      state.requests.push({
        label: command.label,
        ...(input?.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input?.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
        ...(input?.destinationPath ? { destinationPath: input.destinationPath } : {}),
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.website ? { website: input.website } : {}),
      });
      if (command.label === "environment-data:source-control:project-clone-start")
        return { _tag: "Success", value: { cwd: input?.destinationPath } };
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

it.each(["skip", "folder", "website", "close", "expired", "failed-folder"])(
  "isolates clone source when %s",
  async (transition) => {
    state.emptyDomains = true;
    state.requests.length = 0;
    state.clonePhase = transition === "failed-folder" ? "failed" : "done";
    const props = { open: true, onOpenChange: () => {}, destination: EnvironmentId.make("local") };
    await using screen = await render(<NewDomainDialog {...props} />);
    await userEvent.fill(screen.getByLabelText("Website", { exact: true }), "first.example");
    await userEvent.click(screen.getByRole("combobox", { name: "Site files", exact: true }));
    await userEvent.click(page.getByRole("option", { name: "Clone from a Git URL" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Git URL" }), "/fixture/bare.git");
    await userEvent.click(screen.getByRole("button", { name: "Clone site files", exact: true }));
    await expect
      .element(screen.getByRole("button", { name: "Clone site files", exact: true }))
      .toBeDisabled();
    if (transition === "expired") {
      await expect.element(screen.getByText(/Copied to/)).toBeVisible();
      state.clonePhase = null;
      await screen.rerender(<NewDomainDialog {...props} />);
      await expect
        .element(screen.getByRole("button", { name: "Create domain", exact: true }))
        .toBeEnabled();
    } else if (transition === "close") {
      await userEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
      await expect.element(screen.getByText("Reuse previously copied site files")).toBeVisible();
      await expect.element(screen.getByLabelText("Website", { exact: true })).toHaveValue("");
      return;
    } else if (transition === "website") {
      await userEvent.fill(screen.getByLabelText("Website", { exact: true }), "second.example");
      await expect
        .element(screen.getByRole("button", { name: "Clone site files", exact: true }))
        .toBeEnabled();
      return;
    } else {
      await userEvent.click(screen.getByRole("combobox", { name: "Site files", exact: true }));
      await userEvent.click(
        page.getByRole("option", {
          name: transition === "skip" ? "Skip for now" : "Use a folder on this computer",
        }),
      );
      if (transition !== "skip")
        await userEvent.click(screen.getByRole("button", { name: "Choose folder", exact: true }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Create domain", exact: true }));
    await vi.waitFor(() =>
      expect(state.requests.some((r) => r.label === "domains:save")).toBe(true),
    );
    if (transition === "skip")
      expect(state.requests.some((r) => r.label === "environment-data:projects:create-new")).toBe(
        true,
      );
    if (transition === "folder" || transition === "failed-folder")
      expect(state.requests).toContainEqual(
        expect.objectContaining({
          label: "environment-data:commands:project:create",
          workspaceRoot: "/fixture/site",
        }),
      );
    await expect.element(screen.getByLabelText("Website", { exact: true })).toHaveValue("");
    await expect
      .element(screen.getByRole("combobox", { name: "Site files", exact: true }))
      .toHaveTextContent("Skip for now");
    state.emptyDomains = false;
  },
);

it.each(["folder", "clone"])(
  "creates consecutive domains with independent %s sources",
  async (source) => {
    state.emptyDomains = true;
    state.clonePhase = "done";
    state.requests.length = 0;
    await using screen = await render(
      <NewDomainDialog open onOpenChange={() => {}} destination={EnvironmentId.make("local")} />,
    );
    for (const hostname of ["first.example", "second.example"]) {
      await userEvent.fill(screen.getByLabelText("Website", { exact: true }), hostname);
      await userEvent.click(screen.getByRole("combobox", { name: "Site files", exact: true }));
      await userEvent.click(
        page.getByRole("option", {
          name: source === "folder" ? "Use a folder on this computer" : "Clone from a Git URL",
        }),
      );
      if (source === "folder") {
        await userEvent.fill(
          screen.getByRole("textbox", { name: "Folder path" }),
          `/fixture/${hostname}`,
        );
        await userEvent.tab();
      } else {
        await userEvent.fill(
          screen.getByRole("textbox", { name: "Git URL" }),
          `/fixture/${hostname}.git`,
        );
        await userEvent.click(
          screen.getByRole("button", { name: "Clone site files", exact: true }),
        );
        await expect.element(screen.getByText(/^Copied to/)).toBeVisible();
      }
      await userEvent.click(screen.getByRole("button", { name: "Create domain", exact: true }));
      await expect.element(screen.getByLabelText("Website", { exact: true })).toHaveValue("");
    }
    if (source === "folder") {
      expect(state.requests.filter((r) => r.workspaceRoot).map((r) => r.workspaceRoot)).toEqual([
        "/fixture/first.example",
        "/fixture/second.example",
      ]);
    } else {
      const clones = state.requests.filter((r) => r.remoteUrl);
      expect(clones.map((r) => r.remoteUrl)).toEqual([
        "/fixture/first.example.git",
        "/fixture/second.example.git",
      ]);
      expect(clones.map((r) => r.destinationPath)).toEqual([
        "/fixture/clones/first.example",
        "/fixture/clones/second.example",
      ]);
      expect(new Set(clones.map((r) => r.projectId)).size).toBe(2);
      expect(
        state.requests.filter((r) => r.label === "domains:save").map((r) => r.projectId),
      ).toEqual(clones.map((r) => r.projectId));
    }
    expect(state.requests.filter((r) => r.label === "domains:save").map((r) => r.website)).toEqual([
      "first.example",
      "second.example",
    ]);
    state.emptyDomains = false;
  },
);
