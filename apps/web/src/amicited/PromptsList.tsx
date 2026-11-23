import { useState } from "react";
import { ChevronRight, CircleHelp, Lock, MoreHorizontal, Plus } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  availableEngines,
  TrackingEngine,
  type TrackingConfig,
  type TrackingRun,
} from "@amicited/cloud-client/tracking";
import type { DomainVisibility } from "@amicited/cloud-client/visibility";
import type { Domain } from "@amicited/cloud-client/domains";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Input } from "../components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../components/ui/menu";
import { Skeleton } from "../components/ui/skeleton";
import { Switch } from "../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useAmicitedAccount } from "./amicitedAccount";
import { useConnections } from "./amicitedConnections";
import { BudgetBar, countryName, runMilestones, useTracking } from "./amicitedTracking";
import { useVisibility } from "./AiVisibility";
import { EngineMark, MarkLegend, markOf, markTooltip, type MarkState } from "./EngineMark";
import {
  AddPromptDialog,
  DeletePromptDialog,
  usePromptConfig,
  type PromptConfig,
} from "./PromptDialogs";
import { SetupTrackingPrompts } from "./SetupTrackingPrompts";
import { SiteSwitcher } from "./SiteSwitcher";
import { engineLabel } from "./trackingPresentation";
import { VisibilityStatus } from "./VisibilityStatus";
import { plural } from "./visibilityFormat";

type Prompt = TrackingConfig["prompts"][number];
const subscriptionUrl = "https://app.flowhunt.io/amicited/subscription";

export const promptsPath = (projectId: string, promptId?: string, engine?: string) =>
  `/prompts?site=${encodeURIComponent(projectId)}${promptId ? `&prompt=${encodeURIComponent(promptId)}` : ""}${engine ? `&app=${engine}` : ""}`;

/** Tracked prompts weakest first, those without answers last; then the turned-off ones. */
export function orderPrompts(
  config: TrackingConfig | undefined,
  visibility: DomainVisibility | null,
) {
  const rate = (id: string) => {
    const row = visibility?.prompts.find((p) => p.promptId === id);
    return row?.answers ? (row.mentionRate ?? 0) : Number.POSITIVE_INFINITY;
  };
  const prompts = config?.prompts ?? [];
  return {
    tracked: prompts
      .filter((p) => p.enabled)
      .toSorted((a, b) => (rate(a.id) === rate(b.id) ? 0 : rate(a.id) < rate(b.id) ? -1 : 1)),
    off: prompts.filter((p) => !p.enabled),
  };
}

/** The latest run for a website; missed days are not runs. */
const latestRun = (runs: readonly TrackingRun[], projectId: string) =>
  runs.find((r) => r.projectId === projectId && r.status !== "missed");

/** Everything both prompts pages read for one website. */
export function usePromptsData(domain: Domain, environmentId: EnvironmentId) {
  const tracking = useTracking(environmentId);
  const visibilityRows = useVisibility(environmentId, runMilestones(tracking.snapshot.runs));
  const connections = useConnections(environmentId);
  const engines = availableEngines(connections.snapshot.connections);
  const editing = usePromptConfig(domain, tracking, engines);
  const run = latestRun(tracking.snapshot.runs, domain.projectId);
  return {
    tracking,
    visibility: visibilityRows?.find((v) => v.projectId === domain.projectId) ?? null,
    visibilityLoaded: visibilityRows !== null,
    engines,
    editing,
    run,
    running: run?.status === "running",
    sync: tracking.snapshot.sync?.find((s) => s.projectId === domain.projectId),
    runNow: (stop?: boolean) =>
      void tracking.run({
        environmentId,
        input: { projectId: domain.projectId, ...(stop ? { stop } : {}) },
      }),
  };
}

export function PromptsList({
  domain,
  domains,
  environmentId,
}: {
  domain: Domain;
  domains: readonly Domain[];
  environmentId: EnvironmentId;
}) {
  const data = usePromptsData(domain, environmentId);
  const { tracking, editing, visibility, run, running, engines } = data;
  const { account } = useAmicitedAccount();
  const [settingUp, setSettingUp] = useState(false);
  const [deleting, setDeleting] = useState<Prompt | null>(null);
  const config = editing.config;
  const enabled = config?.prompts.filter((p) => p.enabled).length ?? 0;
  const paid = account?.workspaces.find((w) => w.id === domain.workspaceId)?.access === "full";
  const loading = !tracking.loaded;
  const empty = !config || config.prompts.length === 0;
  const canAdd = tracking.canSave;
  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Prompts</h1>
          <SiteSwitcher domains={domains} current={domain} path="/prompts" />
        </div>
        {config && !empty && (
          <p className="text-xs text-muted-foreground">
            {enabled} of {plural(config.prompts.length, "prompt")} tracked ·{" "}
            {plural(config.engines.length, "AI app")} · checked daily at {config.time} on this
            computer · asked from {countryName(config.country)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            marketingNavigate(`/visibility?site=${encodeURIComponent(domain.projectId)}`)
          }
        >
          ← AI Visibility
        </Button>
        {!empty && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!tracking.canRun || !editing.saved || !enabled || running}
              onClick={() => data.runNow()}
            >
              Run now
            </Button>
            <Button
              size="sm"
              disabled={!canAdd}
              onClick={() => editing.setDialog({ mode: "add", limited: false })}
            >
              <Plus /> Add prompt
            </Button>
          </>
        )}
      </div>
    </header>
  );
  if (loading)
    return (
      <>
        {header}
        <ListSkeleton />
      </>
    );
  if (settingUp)
    return (
      <>
        {header}
        <section className="rounded-xl border bg-card p-5">
          <SetupTrackingPrompts
            domain={domain}
            destination={environmentId}
            engines={engines}
            initialPrompts={[]}
            onBack={() => setSettingUp(false)}
            onComplete={async (saved) => {
              if (saved) data.runNow();
              setSettingUp(false);
            }}
          />
        </section>
      </>
    );
  return (
    <>
      {header}
      {empty ? (
        <Empty>
          <EmptyMedia variant="icon">
            <CircleHelp />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Add the questions your buyers ask AI</EmptyTitle>
            <EmptyDescription>
              Each prompt is asked every day on {listOf(engines.map(engineLabel))}, and you see
              whether the answer names {domain.hostname}. Up to 20 prompts, free.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button disabled={!canAdd} onClick={() => setSettingUp(true)}>
                Suggest prompts for me
              </Button>
              <Button
                variant="outline"
                disabled={!canAdd}
                onClick={() => editing.setDialog({ mode: "add", limited: false })}
              >
                Write my own
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <VisibilityStatus
            run={run}
            sync={data.sync}
            time={config.time}
            canRun={tracking.canRun}
            onRun={() => data.runNow()}
            onStop={() => data.runNow(true)}
            firstCheck={
              !run && !visibility?.answers
                ? { prompts: enabled, engines: config.engines.length }
                : undefined
            }
          />
          <PromptsTable
            domain={domain}
            config={config}
            visibility={visibility}
            visibilityLoaded={data.visibilityLoaded}
            run={running ? run : undefined}
            tracking={tracking}
            editing={editing}
            onDelete={setDeleting}
          />
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <CheckSettings
              config={config}
              available={engines}
              canSave={tracking.canSave}
              editing={editing}
            />
            <FreePrompts tracking={tracking} paid={paid} />
          </div>
        </>
      )}
      <AddPromptDialog domain={domain} tracking={tracking} editing={editing} />
      <DeletePromptDialog prompt={deleting} onClose={() => setDeleting(null)} editing={editing} />
    </>
  );
}

const listOf = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading prompts" className="flex flex-col gap-3">
      <Skeleton shape="card" className="h-11" />
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    </div>
  );
}

function PromptsTable({
  domain,
  config,
  visibility,
  visibilityLoaded,
  run,
  tracking,
  editing,
  onDelete,
}: {
  domain: Domain;
  config: TrackingConfig;
  visibility: DomainVisibility | null;
  visibilityLoaded: boolean;
  /** The check in progress, whose answers replace the marks as they arrive. */
  run: TrackingRun | undefined;
  tracking: ReturnType<typeof useTracking>;
  editing: PromptConfig;
  onDelete: (prompt: Prompt) => void;
}) {
  const { tracked, off } = orderPrompts(config, visibility);
  const { usage } = tracking.snapshot;
  const open = (promptId: string, engine?: string) =>
    marketingNavigate(promptsPath(domain.projectId, promptId, engine));
  const mark = (promptId: string, engine: TrackingEngine): MarkState | undefined => {
    if (run) {
      const answer = run.answers.findLast((a) => a.promptId === promptId && a.engine === engine);
      return answer && markOf(answer);
    }
    return visibility?.prompts
      .find((p) => p.promptId === promptId)
      ?.latest.find((l) => l.engine === engine);
  };
  const row = (prompt: Prompt) => {
    const stats = visibility?.prompts.find((p) => p.promptId === prompt.id);
    const muted = !prompt.enabled;
    return (
      <TableRow key={prompt.id} className="cursor-pointer" onClick={() => open(prompt.id)}>
        <TableCell>
          <Tooltip>
            <TooltipTrigger
              render={<span className={`block truncate ${muted ? "text-muted-foreground" : ""}`} />}
            >
              {prompt.text}
            </TooltipTrigger>
            <TooltipPopup>{prompt.text}</TooltipPopup>
          </Tooltip>
        </TableCell>
        {config.engines.map((engine) => {
          if (muted)
            return (
              <TableCell key={engine}>
                <div className="flex justify-center text-muted-foreground">–</div>
              </TableCell>
            );
          const latest = mark(prompt.id, engine);
          return (
            <TableCell
              key={engine}
              onClick={(event) => {
                event.stopPropagation();
                open(prompt.id, engine);
              }}
            >
              <Tooltip>
                <TooltipTrigger render={<div className="flex justify-center" />}>
                  <EngineMark latest={latest} />
                </TooltipTrigger>
                <TooltipPopup>{markTooltip(engine, latest, visibility?.to)}</TooltipPopup>
              </Tooltip>
            </TableCell>
          );
        })}
        <TableCell>
          {stats?.answers ? (
            <span
              className={`flex items-center gap-2 tabular-nums ${muted ? "text-muted-foreground" : ""}`}
            >
              <span className="h-1.5 w-18 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${stats.mentionRate ?? 0}%` }}
                />
              </span>
              {stats.mentioned} of {stats.answers}
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </TableCell>
        <TableCell className="@max-4xl:hidden">
          <span className="block truncate text-muted-foreground">{stats?.namedInstead ?? "–"}</span>
        </TableCell>
        <TableCell onClick={(event) => event.stopPropagation()}>
          <Switch
            size="sm"
            aria-label={`Track ${prompt.text}`}
            checked={prompt.enabled}
            disabled={!tracking.canSave}
            onCheckedChange={(checked) => void editing.setEnabled(prompt, checked)}
          />
        </TableCell>
        <TableCell onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Actions for ${prompt.text}`}
                  />
                }
              >
                <MoreHorizontal />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={() => open(prompt.id)}>Open answers</MenuItem>
                <MenuItem
                  disabled={!tracking.canSave}
                  onClick={() => void editing.setEnabled(prompt, !prompt.enabled)}
                >
                  {prompt.enabled ? "Turn off" : "Turn on"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  variant="destructive"
                  disabled={!tracking.canSave}
                  onClick={() => onDelete(prompt)}
                >
                  Delete…
                </MenuItem>
              </MenuPopup>
            </Menu>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </div>
        </TableCell>
      </TableRow>
    );
  };
  return (
    <section
      aria-label="Prompts"
      className="@container flex flex-col gap-2 rounded-xl border bg-card py-3"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">{plural(config.prompts.length, "prompt")}</h2>
          {(!tracking.canSave || !tracking.canRun) && (
            <p className="text-xs text-muted-foreground">
              View only. This connection can't change prompts or run checks.
            </p>
          )}
        </div>
        <MarkLegend />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {usage.used} of {usage.limit} free prompts <BudgetBar used={usage.used} />
        </span>
      </header>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="text-xs text-muted-foreground">Prompt · weakest first</span>
            </TableHead>
            {config.engines.map((engine) => (
              <TableHead key={engine} className="w-20">
                <span className="block truncate text-center text-xs text-muted-foreground">
                  {shortEngine(engine)}
                </span>
              </TableHead>
            ))}
            <TableHead className="w-36">
              <span className="text-xs text-muted-foreground">Named in, 30 days</span>
            </TableHead>
            <TableHead className="w-28 @max-4xl:hidden">
              <span className="text-xs text-muted-foreground">Named instead</span>
            </TableHead>
            <TableHead className="w-16">
              <span className="text-xs text-muted-foreground">Tracked</span>
            </TableHead>
            <TableHead className="w-16" aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!visibilityLoaded
            ? [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={config.engines.length + 5}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            : tracked.map(row)}
          {off.length > 0 && (
            <TableRow>
              <TableCell colSpan={config.engines.length + 5}>
                <span className="text-xs text-muted-foreground">
                  Turned off · {off.length} · not asked, history kept
                </span>
              </TableCell>
            </TableRow>
          )}
          {visibilityLoaded && off.map(row)}
        </TableBody>
      </Table>
    </section>
  );
}

const shortEngine = (engine: string) =>
  ({ google_overviews: "Overviews", google: "AI Mode" })[engine] ?? engineLabel(engine);

function CheckSettings({
  config,
  available,
  canSave,
  editing,
}: {
  config: TrackingConfig;
  available: readonly TrackingEngine[];
  canSave: boolean;
  editing: PromptConfig;
}) {
  const checked = config.engines.filter((e) => available.includes(e));
  const setEngine = (engine: TrackingEngine, on: boolean) =>
    void editing.persist({
      ...config,
      engines: on
        ? TrackingEngine.literals.filter((e) => e === engine || config.engines.includes(e))
        : config.engines.filter((e) => e !== engine),
    });
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <header>
        <h2 className="text-sm font-semibold">How these are checked</h2>
        <p className="text-xs text-muted-foreground">
          On this computer, signed in as you. Changes apply from the next check.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr]">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Every day at</span>
          <Input
            key={config.time}
            type="time"
            size="sm"
            aria-label="Every day at"
            defaultValue={config.time}
            disabled={!canSave}
            onBlur={(event) => {
              const time = event.target.value;
              if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== config.time)
                void editing.persist({ ...config, time });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="text-xs text-muted-foreground">While AmICited is open.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Asked from</span>
          <span className="text-sm">{countryName(config.country)}</span>
          <span className="text-xs text-muted-foreground">This computer's location.</span>
          <a
            href={subscriptionUrl}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Lock className="size-3" /> Other countries
          </a>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">AI apps</span>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {TrackingEngine.literals.map((engine) => {
              const connected = available.includes(engine);
              const on = config.engines.includes(engine);
              const last = on && checked.length === 1;
              return (
                <li key={engine} className="flex items-center justify-between gap-3 text-sm">
                  <span className={connected ? "" : "text-muted-foreground"}>
                    {engineLabel(engine)}
                  </span>
                  {!connected ? (
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() => marketingNavigate("/marketing-settings")}
                    >
                      Connect
                    </Button>
                  ) : last ? (
                    <Tooltip>
                      <TooltipTrigger render={<span />}>
                        <Switch size="sm" aria-label={engineLabel(engine)} checked disabled />
                      </TooltipTrigger>
                      <TooltipPopup>At least one AI app is checked</TooltipPopup>
                    </Tooltip>
                  ) : (
                    <Switch
                      size="sm"
                      aria-label={engineLabel(engine)}
                      checked={on}
                      disabled={!canSave}
                      onCheckedChange={(next) => setEngine(engine, next)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FreePrompts({
  tracking,
  paid,
}: {
  tracking: ReturnType<typeof useTracking>;
  paid: boolean;
}) {
  const { usage } = tracking.snapshot;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Free prompts on this computer</h2>
          <p className="text-xs text-muted-foreground">One limit across all your websites.</p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {usage.used} of {usage.limit}
        </span>
      </header>
      <BudgetBar used={usage.used} />
      <p className="text-xs text-muted-foreground">
        {[
          ...usage.domains.map((d) => `${d.hostname} ${d.count}`),
          `asked today ${usage.consumed ?? 0} of ${usage.limit}`,
        ].join(" · ")}
      </p>
      <p className="text-xs text-muted-foreground">
        More than 20 prompts, other countries, Grok, Meta Muse and DeepSeek, and days this computer
        is off run in the cloud.{" "}
        {paid ? (
          <a
            href="https://app.flowhunt.io/amicited"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Prompts AmICited checks in the cloud are in AmICited ↗
          </a>
        ) : (
          <a
            href={subscriptionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Start 7-day trial ↗
          </a>
        )}
      </p>
    </section>
  );
}
