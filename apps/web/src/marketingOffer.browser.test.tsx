import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../test/render";
import {
  EnvironmentId,
  RunId,
  ThreadId,
  type OrchestrationV2ProjectedTurnItem,
} from "@t3tools/contracts";
const state = vi.hoisted(() => ({
  items: [] as OrchestrationV2ProjectedTurnItem[],
  details: {} as Record<string, { item: OrchestrationV2ProjectedTurnItem["item"] }>,
  connected: false,
  dismissed: false,
}));
vi.mock("./marketing", () => ({
  MarketingSubscriptions: () => null,
  useMarketingTask: () => ({ startTask: async () => {} }),
}));
vi.mock("./state/entities", () => ({
  useThreadVisibleTurnItems: () => state.items,
  useThreadShell: () => null,
}));
vi.mock("./state/queries", () => ({
  useTurnItemDetail: (target: { itemId: string } | null) => ({
    data: target ? (state.details[target.itemId] ?? null) : null,
    isPending: false,
  }),
}));
vi.mock("./rpc/amicitedCloud", async () => {
  const { shouldOfferUpsell } = await import("@amicited/cloud-client/upsell");
  return {
    CloudConnectedChip: () => null,
    CloudPendingApprovals: () => null,
    openCloudSubscription: () => {},
    CloudFooter: ({ result }: { result: { tool: string; status: string; output?: unknown } }) =>
      shouldOfferUpsell(result, { dismissed: state.dismissed }, false, 0, state.connected) ? (
        <aside aria-label="Cloud offer">{result.tool}</aside>
      ) : null,
  };
});
import { MarketingTranscriptCard, MarketingTurnOffer } from "./marketingChat";
const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("chat") };
it.each([
  { connected: false, dismissed: false, offered: true, connectionTool: false, hiddenReply: false },
  { connected: true, dismissed: false, offered: false, connectionTool: false, hiddenReply: false },
  { connected: false, dismissed: true, offered: false, connectionTool: false, hiddenReply: false },
  { connected: false, dismissed: false, offered: true, connectionTool: true, hiddenReply: false },
  { connected: false, dismissed: true, offered: false, connectionTool: true, hiddenReply: false },
  { connected: false, dismissed: false, offered: false, connectionTool: true, hiddenReply: true },
])(
  "offers the last eligible successful result in a multi-tool turn, gated by $connected/$dismissed",
  async ({ connected, dismissed, offered, connectionTool, hiddenReply }) => {
    state.connected = connected;
    state.dismissed = dismissed;
    state.items = [
      ["seo.site.audit", { score: 41 }],
      ["content.readability", { words: 100 }],
      ["content.write", { status: "needs_provider", draft: null }],
      ["seo.llmstxt.check", { score: 0 }],
    ].map(
      ([tool, output], index) =>
        ({
          item: {
            id: String(index),
            type: "dynamic_tool",
            runId: "run",
            toolName: "marketing_tools_run",
            status: "completed",
            output: {
              id: String(index),
              tool,
              status: "success",
              input: {},
              startedAt: "2026-11-07T09:00:00Z",
              durationMs: 1,
              output,
            },
          },
        }) as unknown as OrchestrationV2ProjectedTurnItem,
    );
    if (connectionTool)
      state.items = [
        ...state.items,
        {
          item: {
            id: "connection",
            type: "dynamic_tool",
            runId: "run",
            toolName: "amicited_connection",
            status: "completed",
            output: {
              kind: "amicited-connection",
              state: hiddenReply ? "hidden" : "disconnected",
              action: "Connect AmICited",
              missing: "Daily measured citations",
            },
          },
        } as unknown as OrchestrationV2ProjectedTurnItem,
      ];
    await using screen = await render(
      <MarketingTurnOffer threadRef={threadRef} runId={RunId.make("run")} />,
      // This test exercises result selection and gates without navigation.
      { router: false },
    );
    if (offered)
      await expect
        .element(screen.getByRole("complementary", { name: "Cloud offer" }))
        .toHaveTextContent(connectionTool ? "amicited.connection" : "content.readability");
    else
      await expect
        .element(screen.getByRole("complementary", { name: "Cloud offer" }))
        .not.toBeInTheDocument();
  },
);

it("merges a start and poll when the timeline omits their outputs", async () => {
  state.items = ["start", "get"].map(
    (step, ordinal) =>
      ({
        sourceThreadId: threadRef.threadId,
        sourceItemId: `cloud-${step}`,
        item: {
          id: `cloud-${step}`,
          type: "dynamic_tool",
          runId: "cloud-run",
          ordinal,
          toolName: "amicited_cloud_call",
          status: "completed",
          updatedAt: DateTime.makeUnsafe(0),
          input: {
            tool: `free_brand_visibility_${step}`,
            arguments:
              step === "start" ? { request: { website: "acme.com" } } : { run_id: "brand-1" },
          },
          outputOmitted: true,
        },
      }) as unknown as OrchestrationV2ProjectedTurnItem,
  );
  state.details = Object.fromEntries(
    state.items.map((projected, index) => [
      projected.sourceItemId,
      {
        item: {
          ...projected.item,
          outputOmitted: false,
          output: {
            kind: "amicited-cloud-result",
            tool: `free_brand_visibility_${index === 0 ? "start" : "get"}`,
            result: {
              structuredContent: {
                run_id: "brand-1",
                status: index === 0 ? "pending" : "success",
                providers: [
                  { provider: "chatgpt", status: "success", mentioned: true, visibility_score: 62 },
                ],
              },
            },
          },
        },
      },
    ]),
  );
  await using screen = await render(
    <>
      {state.items.map((projected) => (
        <MarketingTranscriptCard
          key={projected.item.id}
          projectedItem={projected}
          environmentId={threadRef.environmentId}
          output={undefined}
        />
      ))}
    </>,
  );
  await expect
    .element(screen.getByRole("article", { name: "AmICited tool result" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText("Checked brand visibility on acme.com"))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText("Started checking brand visibility on acme.com"))
    .not.toBeInTheDocument();
});
