import { publish } from "~/marketingDomainStore";
import { createMemoryHistory } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform (React Compiler over ~4k lines)
// takes 6-11s; importing it here keeps that out of the test's timeout.
import "~/components/ChatView";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it.each(["developer", "marketer"] as const)(
  "a new %s draft does not load its reserved thread before the server lists it",
  async (mode) => {
    using _mode = (() => {
      const previous = localStorage.getItem("amicited.workspace-mode");
      localStorage.setItem("amicited.workspace-mode", mode);
      return {
        [Symbol.dispose]() {
          if (previous === null) localStorage.removeItem("amicited.workspace-mode");
          else localStorage.setItem("amicited.workspace-mode", previous);
        },
      };
    })();
    using _environment = installFakeEnvironment([]);
    using fetchSpy = vi.spyOn(globalThis, "fetch");
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    });
    const draftId = DraftId.make("draft-27443");
    const threadId = ThreadId.make("thread-27443");
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, { threadId });

    const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
    await router.load();
    await using _app = await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    });
    await expect.element(page.getByTestId("composer-editor")).toBeVisible();
    // The shell snapshot has arrived once the sidebar lists the project, so the connection is up.
    if (mode === "developer")
      await expect.element(page.getByText("render", { exact: true }).first()).toBeVisible();
    else {
      await expect
        .element(page.getByRole("heading", { name: "What do you want to work on?" }))
        .toBeVisible();
      await page.getByRole("button", { name: "Audit my website for AI search" }).click();
      await expect
        .element(page.getByTestId("composer-editor"))
        .toHaveTextContent("Audit my website for AI search");
    }

    const threadRequests = fetchSpy.mock.calls
      .map(([input]) => String(input instanceof Request ? input.url : input))
      .filter((url) => url.includes(`/api/orchestration/threads/${threadId}/`));
    // A 404 here marks the thread deleted, and the view never loads it once the send creates it.
    expect(threadRequests).toEqual([]);
  },
);

it.each([false, true])("shows marketer thread location with site files=%s", async (siteFiles) => {
  await page.viewport(1344, 1016);
  const previous = localStorage.getItem("amicited.workspace-mode");
  localStorage.setItem("amicited.workspace-mode", "marketer");
  using _mode = {
    [Symbol.dispose]() {
      if (previous === null) localStorage.removeItem("amicited.workspace-mode");
      else localStorage.setItem("amicited.workspace-mode", previous);
      publish(ENVIRONMENT_ID, []);
    },
  };
  const fixture = threadWithHistory(`location-${siteFiles}`, 0);
  using _environment = installFakeEnvironment([fixture]);
  publish(ENVIRONMENT_ID, [
    {
      projectId: PROJECT_ID,
      hostname: "example.com",
      brand: "Example",
      connectionRef: PROJECT_ID,
      cms: siteFiles ? "git" : "unknown",
      siteFiles: siteFiles ? "/workspace/render" : null,
    },
  ]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${fixture.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    router: false /* AppRoot owns the router */,
  });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  await expect.element(page.getByLabelText(/Run context:.*Render scenarios/)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Add project script" }))
    .not.toBeInTheDocument();
});
