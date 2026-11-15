import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import "./index.css";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../test/render";
import {
  EnvironmentId,
  ThreadId,
  MessageId,
  RunId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
  type ServerProvider,
} from "@t3tools/contracts";
import { withMarketingReport } from "./marketingContext";
const state = vi.hoisted(() => ({
  items: [] as OrchestrationV2ProjectedTurnItem[],
  provider: {} as ServerProvider,
  thread: {
    providerInstanceId: "claudeAgent",
    latestRun: { status: "failed", runId: "failed" },
    runtimeMode: "full-access",
    interactionMode: "default",
  },
  send: vi.fn(async (_request: unknown) => ({ _tag: "Success" })),
}));
vi.mock(import("./state/entities"), async (original) => ({
  ...(await original()),
  useThreadVisibleTurnItems: () => state.items,
  useThreadShell: (() => state.thread) as never,
}));
vi.mock(import("./state/environments"), async (original) => ({
  ...(await original()),
  useEnvironmentProviders: () => new Map([[EnvironmentId.make("local"), [state.provider]]]),
}));
vi.mock(import("./state/use-orchestration-command"), () => ({
  useOrchestrationCommand: (() => state.send) as never,
}));
vi.mock(import("./marketing"), async (original) => ({
  ...(await original()),
  MarketingSubscriptions: () => <p>Subscription authentication boundary</p>,
}));
import { MarketingSignInRecovery } from "./marketingChat";
it("recovers the persisted failed message after authentication and removes stale recovery", async () => {
  const ref = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("chat"));
  const message = {
    type: "user_message",
    messageId: MessageId.make("saved"),
    text: "Explain this report",
    attachments: [
      { type: "image", id: "image", name: "campaign.png", mimeType: "image/png", sizeBytes: 512 },
    ],
    context: withMarketingReport(undefined, {
      id: "report",
      tool: "content.readability",
      output: { words: 100, grade: 7 },
    }),
  };
  state.items = [
    { item: { ...message, id: "message", runId: "failed" } },
    { item: { type: "error", id: "error", status: "failed", runId: "failed" } },
    {
      item: {
        ...message,
        id: "other-message",
        messageId: "other",
        text: "An unrelated message",
        runId: "other",
      },
    },
  ] as unknown as OrchestrationV2ProjectedTurnItem[];
  state.thread = {
    providerInstanceId: "claudeAgent",
    latestRun: { status: "failed", runId: "failed" },
    runtimeMode: "full-access",
    interactionMode: "default",
  };
  state.provider = {
    instanceId: "claudeAgent",
    driver: "claudeAgent",
    enabled: true,
    installed: true,
    status: "warning",
    auth: { status: "unauthenticated" },
  } as ServerProvider;
  state.send.mockReset().mockResolvedValue({ _tag: "Success" });
  const view = () => (
    <MarketingSignInRecovery threadRef={ref} errorItemId={TurnItemId.make("error")} />
  );
  await using screen = await render(view());
  await screen.getByRole("button", { name: "Sign in to Claude" }).click();
  await expect.element(screen.getByText("Subscription authentication boundary")).toBeVisible();
  expect(state.send).not.toHaveBeenCalled();
  state.provider = {
    ...state.provider,
    status: "ready",
    auth: { status: "authenticated" },
  } as ServerProvider;
  await screen.rerender(view());
  await screen.getByRole("button", { name: "Try again" }).click();
  await vi.waitFor(() =>
    expect(state.send).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      input: {
        threadId: ref.threadId,
        message: {
          messageId: message.messageId,
          role: "user",
          text: message.text,
          attachments: message.attachments,
          context: message.context,
        },
        runtimeMode: "full-access",
        interactionMode: "default",
      },
    }),
  );
  expect(
    state.items.filter(({ item }) => item.type === "user_message" && item.runId === "failed"),
  ).toHaveLength(1);
  state.thread = {
    ...state.thread,
    latestRun: { status: "completed", runId: RunId.make("retried") },
  };
  await screen.rerender(view());
  await expect
    .element(screen.getByRole("article", { name: "Assistant sign in" }))
    .not.toBeInTheDocument();
});
