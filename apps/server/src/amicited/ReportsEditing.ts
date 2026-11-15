import * as Stream from "effect/Stream";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CommandId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { ReportFailure, type ReportSnapshot } from "@amicited/reports/rpc";
import * as Reports from "./Reports.ts";
import * as ReportsPreview from "./ReportsPreview.ts";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Settings from "../serverSettings.ts";
import * as Preview from "../preview/Manager.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export function commentaryData(
  blocks: readonly { id: string; prompt: string; data?: readonly string[] }[],
  datasets: Readonly<Record<string, unknown>>,
  errors: Readonly<Record<string, string>>,
): string {
  return encodeJson(
    blocks.map((block) => ({
      id: block.id,
      prompt: block.prompt,
      datasets: Object.fromEntries(
        (block.data ?? Object.keys(datasets)).map((id) => {
          const value = datasets[id];
          const rows = Array.isArray(value) ? value.slice(0, 25) : value;
          const text = encodeJson(rows ?? null);
          return [
            id,
            text.length > 4000
              ? { trimmed: true, excerpt: text.slice(0, 4000) }
              : { trimmed: Array.isArray(value) && value.length > 25, value: rows ?? null },
          ];
        }),
      ),
      errors: Object.fromEntries(
        (block.data ?? Object.keys(errors))
          .filter((id) => errors[id])
          .map((id) => [id, errors[id]]),
      ),
    })),
  );
}
const reportInstructions = (id: string) =>
  `Design report ${id}. Use report_get for its validated JSON spec, report_api search/describe to discover GET endpoints and response schemas, report_save to validate and preview changes, and report_run to freeze a snapshot. workspace_id and domain_id are injected; never put credentials in the spec. All expressions are JSONata: query params and text use {{ expression }}; chart blocks use Vega-Lite without data or $schema. The live preview is open in the browser panel. Follow the user's reporting request.`;
export class ReportsEditing extends Context.Service<
  ReportsEditing,
  {
    readonly edit: (
      id: string,
      request?: string,
    ) => Effect.Effect<{ threadId: string; tabId: string | null }, ReportFailure>;
    readonly links: (
      input: { reportId: string } | { snapshotId: string },
    ) => Effect.Effect<
      { preview?: string; html?: string; pdf?: string; pptx?: string },
      ReportFailure
    >;
    readonly run: (id: string, projectId?: string) => Effect.Effect<ReportSnapshot, ReportFailure>;
  }
>()("t3/amicited/ReportsEditing") {}
export const layer = Layer.effect(
  ReportsEditing,
  Effect.gen(function* () {
    const random = yield* SecureRandom.SecureRandom;
    const reports = yield* Reports.Reports;
    const tokens = yield* ReportsPreview.ReportsPreview;
    const launch = yield* ThreadLaunch.ThreadLaunchService;
    const threads = yield* Threads.ThreadManagementService;
    const settings = yield* Settings.ServerSettingsService;
    const preview = yield* Preview.PreviewManager;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.streamDomainEvents.pipe(
      Stream.runForEach((event) =>
        event.type === "run.updated" &&
        ["completed", "interrupted", "failed", "cancelled", "rolled_back"].includes(
          event.payload.status,
        )
          ? reports.narrativeFinished(event.threadId).pipe(Effect.ignore)
          : Effect.void,
      ),
      Effect.forkScoped,
    );
    const start = Effect.fn("ReportsEditing.start")(function* (
      projectId: string,
      title: string,
      text: string,
      threadId?: string,
      unattended = false,
    ) {
      const resolved = resolveProjectSettings(
        yield* settings.getSettings,
        ProjectId.make(projectId),
      ).settings;
      const modelSelection =
        resolved.defaultModelSelection ?? resolved.textGenerationModelSelection;
      return yield* launch.launch({
        commandId: CommandId.make(yield* random.uuidV4()),
        ...(threadId ? { threadId: ThreadId.make(threadId) } : {}),
        projectId: ProjectId.make(projectId),
        title,
        modelSelection,
        // Unattended commentary stays supervised; its one write tool needs no approval.
        runtimeMode: unattended ? "approval-required" : resolved.defaultRuntimeMode,
        interactionMode: "default",
        workspaceStrategy: { type: "root" },
        initialMessage: { text, attachments: [] },
        createdBy: "user",
        creationSource: "web",
      });
    });
    const edit = Effect.fn("ReportsEditing.edit")(
      function* (id: string, request?: string) {
        const report = yield* reports.get(id);
        const url = yield* tokens.url(id);
        const existing = report.threadId
          ? yield* threads.getThreadShell(ThreadId.make(report.threadId))
          : null;
        const threadId =
          existing && existing.deletedAt === null
            ? existing.id
            : (yield* start(
                report.projectId,
                `Edit report: ${report.title}`,
                [request?.trim(), reportInstructions(id)].filter(Boolean).join("\n\n"),
              )).threadId;
        if (threadId !== report.threadId) yield* reports.update({ id, threadId });
        else if (request?.trim())
          yield* threads.sendToThread({
            projectId: ProjectId.make(report.projectId),
            commandId: CommandId.make(yield* random.uuidV4()),
            threadId: ThreadId.make(threadId),
            messageId: MessageId.make(yield* random.uuidV4()),
            text: request.trim(),
            attachments: [],
            mode: "auto",
            createdBy: "user",
            creationSource: "web",
          });
        const sessions = yield* preview.list({ threadId: ThreadId.make(threadId) });
        const existingTab = sessions.sessions.find(
          (s) =>
            "url" in s.navStatus &&
            s.navStatus.url.includes(`/api/amicited/reports/${encodeURIComponent(id)}/preview`),
        );
        const tab = yield* preview.open({
          ...(existingTab ? { reuseTabId: existingTab.tabId, viewport: existingTab.viewport } : {}),
          threadId: ThreadId.make(threadId),
          url,
          reveal: true,
          runtime: "server",
        });
        yield* preview.requestReveal({
          threadId: ThreadId.make(threadId),
          tabId: tab.tabId,
          force: true,
        });
        return { threadId, tabId: tab.tabId };
      },
      Effect.mapError(
        () => new ReportFailure({ message: "Could not open the report editing thread." }),
      ),
    );
    const run = Effect.fn("ReportsEditing.run")(function* (id: string, projectId?: string) {
      const s = yield* reports.run(id, projectId);
      const report = yield* reports.get(id, projectId);
      const blocks = s.spec.pages.flatMap((p) => p.blocks).filter((b) => b.type === "narrative");
      if (s.narrativeRequested && blocks.length) {
        yield* Effect.gen(function* () {
          const threadId = yield* random.uuidV4();
          yield* start(
            report.projectId,
            `Commentary: ${report.title}`,
            `Write commentary for report snapshot ${s.id}. Submit each block using report_narrative_submit with snapshotId, blockId and markdown. Use report_get and report_api search/describe for context. Base conclusions only on these frozen datasets; acknowledge missing data.\n${commentaryData(blocks, s.datasets, s.errors)}`,
            threadId,
            true,
          ).pipe(
            Effect.onError(() => reports.attachNarrativeThread(s.id, threadId).pipe(Effect.ignore)),
          );
          yield* reports.attachNarrativeThread(s.id, threadId);
        }).pipe(Effect.ignore);
      }
      return yield* reports.snapshot(s.id);
    });
    const links = Effect.fn("ReportsEditing.links")(function* (
      input: { reportId: string } | { snapshotId: string },
    ) {
      if ("reportId" in input) {
        yield* reports.get(input.reportId);
        return { preview: yield* tokens.path(input.reportId, "preview") };
      }
      yield* reports.snapshot(input.snapshotId);
      return {
        html: yield* tokens.path(input.snapshotId, "html"),
        pdf: yield* tokens.path(input.snapshotId, "pdf"),
        pptx: yield* tokens.path(input.snapshotId, "pptx"),
      };
    });
    return { edit, run, links };
  }),
);
