import { expect, it, vi } from "vite-plus/test";
import { render, act } from "../test/render";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
const state = vi.hoisted(() => ({
  approvals: [] as {
    requestId: string;
    threadId: string;
    tool: string;
    free: boolean;
    readOnly: boolean;
    arguments: Record<string, unknown>;
    message: string;
  }[],
  listeners: new Set<() => void>(),
}));
vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/atom-react")>();
  const { useSyncExternalStore } = await import("react");
  const { AsyncResult } = await import("effect/reactivity");
  return {
    ...actual,
    useAtomValue: (atom: { stream?: boolean }) => {
      const snapshot = useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        },
        () => (atom.stream ? state.approvals : true),
      );
      return atom.stream ? AsyncResult.success(snapshot) : snapshot;
    },
  };
});
vi.mock("@t3tools/client-runtime/state/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/client-runtime/state/runtime")>()),
  createEnvironmentRpcCommand: () => ({ permissionAtom: () => ({}) }),
  createEnvironmentRpcSubscriptionAtomFamily: () => () => ({ stream: true }),
}));
vi.mock("./state/use-atom-command", () => ({
  useAtomCommand: () => async () => {
    state.approvals = [];
    state.listeners.forEach((listener) => listener());
    return { _tag: "Success", value: {} };
  },
}));
vi.mock("./state/environments", () => ({ usePrimaryEnvironmentId: () => "local" }));
vi.mock("./connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("./localApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./localApi")>()),
  createLocalApi: () => ({ shell: { openExternal: async () => {} } }),
}));
vi.mock("./state/entities", () => ({ useThreadVisibleTurnItems: () => [] }));
const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("chat") };
it("matches streamed approvals independent of key order and replaces the waiting work row", async () => {
  state.approvals = [];
  const { CloudPendingApprovals } = await import("./rpc/amicitedApprovals");
  await using screen = await render(
    <CloudPendingApprovals
      threadRef={threadRef}
      tool="free_site_health_start"
      arguments={{ request: { target: "example.com", depth: 1 } }}
      fallback={<p>Running site health</p>}
    />,
  );
  await expect.element(screen.getByText("Running site health")).toBeVisible();
  await act(() => {
    state.approvals = [
      {
        requestId: "approval",
        threadId: "chat",
        tool: "free_site_health_start",
        free: true,
        readOnly: false,
        arguments: { request: { depth: 1, target: "example.com" } },
        message: "Check site health for example.com",
      },
    ];
    state.listeners.forEach((listener) => listener());
  });
  await expect
    .element(screen.getByRole("complementary", { name: "AmICited approval" }))
    .toBeVisible();
  await expect.element(screen.getByText("Running site health")).not.toBeInTheDocument();
  await screen
    .getByRole("button", { name: "Allow these checks in this chat", exact: true })
    .click();
  await expect
    .element(screen.getByRole("complementary", { name: "AmICited approval" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Running site health")).toBeVisible();
});
