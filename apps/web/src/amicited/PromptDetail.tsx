import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, SearchX } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import type { PromptHistory, TrackingEngine } from "@amicited/cloud-client/tracking";
import type { Domain } from "@amicited/cloud-client/domains";
import { marketingNavigate } from "@amicited/ui-marketing";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { Button } from "../components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../components/ui/menu";
import { Skeleton } from "../components/ui/skeleton";
import { Switch } from "../components/ui/switch";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { countryName, runMilestones } from "./amicitedTracking";
import { AnswerPanel } from "./AnswerPanel";
import { EngineMark, MarkLegend, markOf } from "./EngineMark";
import { AddPromptDialog, DeletePromptDialog } from "./PromptDialogs";
import { PromptHistoryGrid } from "./PromptHistoryGrid";
import { orderPrompts, promptsPath, usePromptsData } from "./PromptsList";
import { engineLabel } from "./trackingPresentation";
import { AttentionRow, VisibilityStatus } from "./VisibilityStatus";
import { dayLabel, plural } from "./visibilityFormat";

const promptCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.prompt",
  label: "tracking:prompt",
});

function usePromptHistory(
  environmentId: EnvironmentId,
  projectId: string,
  promptId: string,
  refreshKey: string,
) {
  const read = useEffectEvent(useAtomCommand(promptCommand));
  const key = `${projectId}|${promptId}`;
  const [loaded, setLoaded] = useState<{ key: string; value: PromptHistory | null } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Rereads the prompt's history from the server whenever a tracking run changes.
  useEffect(() => {
    let active = true;
    void read({ environmentId, input: { projectId, promptId } }).then((r) => {
      if (active) setLoaded({ key, value: r._tag === "Success" ? r.value : null });
    });
    return () => {
      active = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A tracking run changing is what changes the history, so it rereads it.
  }, [environmentId, projectId, promptId, key, refreshKey]);
  return loaded?.key === key
    ? { history: loaded.value, loaded: true }
    : { history: null, loaded: false };
}

export function PromptDetail({
  domain,
  environmentId,
  promptId,
  app,
}: {
  domain: Domain;
  environmentId: EnvironmentId;
  promptId: string;
  app: string | undefined;
}) {
  const data = usePromptsData(domain, environmentId);
  const { tracking, editing, visibility } = data;
  const { history, loaded } = usePromptHistory(
    environmentId,
    domain.projectId,
    promptId,
    runMilestones(tracking.snapshot.runs),
  );
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const config = editing.config;
  const prompt = config?.prompts.find((p) => p.id === promptId);
  const back = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => marketingNavigate(promptsPath(domain.projectId))}
    >
      ← Prompts · {domain.hostname}
    </Button>
  );
  if (!tracking.loaded)
    return (
      <>
        <div className="flex">{back}</div>
        <DetailSkeleton />
      </>
    );
  if (!config || !prompt)
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>This prompt is no longer tracked</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => marketingNavigate(promptsPath(domain.projectId))}>
            Back to prompts
          </Button>
        </EmptyContent>
      </Empty>
    );
  const { tracked, off } = orderPrompts(config, visibility);
  const order = [...tracked, ...off];
  const index = order.findIndex((p) => p.id === promptId);
  const previous = order[index - 1];
  const next = order[index + 1];
  const stats = visibility?.prompts.find((p) => p.promptId === promptId);
  const engines = config.engines;
  const latestFor = (engine: TrackingEngine) =>
    history?.latest.find((l) => l.answer.engine === engine);
  const selected =
    engines.find((e) => e === app) ??
    engines.find((e) => {
      const latest = latestFor(e);
      return latest && markOf(latest.answer).mentioned;
    }) ??
    engines[0];
  const selectTab = (engine: TrackingEngine) =>
    void navigate({
      to: "/prompts",
      search: { site: domain.projectId, prompt: promptId, app: engine },
      replace: true,
    });
  const created = /^\d{4}-\d{2}-\d{2}/.test(prompt.created) ? prompt.created.slice(0, 10) : null;
  const positioned = history?.history.filter((c) => c.position !== null).length ?? 0;
  const lastAsked = history?.history.at(-1)?.day;
  const brand = domain.brand || domain.hostname;
  const step = (target: typeof previous, label: string, icon: ReactNode) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={label}
            disabled={!target}
            onClick={() =>
              target && marketingNavigate(promptsPath(domain.projectId, target.id, app))
            }
          />
        }
      >
        {icon}
      </TooltipTrigger>
      {target && <TooltipPopup>{target.text}</TooltipPopup>}
    </Tooltip>
  );
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {back}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {index + 1} of {order.length}
          {step(previous, "Previous prompt", <ChevronLeft />)}
          {step(next, "Next prompt", <ChevronRight />)}
        </span>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold">{prompt.text}</h1>
          <p className="text-xs text-muted-foreground">
            Asked every day at {config.time} from {countryName(config.country)} ·{" "}
            {plural(engines.length, "AI app")}
            {created ? ` · tracked since ${dayLabel(created)}` : ""} · last 30 days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Tracked
            <Switch
              size="sm"
              checked={prompt.enabled}
              disabled={!tracking.canSave}
              onCheckedChange={(checked) => void editing.setEnabled(prompt, checked)}
            />
          </label>
          <Menu>
            <MenuTrigger
              render={<Button variant="outline" size="icon-xs" aria-label="Prompt actions" />}
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                variant="destructive"
                disabled={!tracking.canSave}
                onClick={() => setDeleting(true)}
              >
                Delete…
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </header>
      {!prompt.enabled && (
        <section className="rounded-xl border bg-card">
          <AttentionRow
            tone="info"
            title="This prompt is turned off."
            detail={`${lastAsked ? `It was last asked on ${dayLabel(lastAsked)}.` : "It has not been asked in the last 30 days."} Its history stays until it is 30 days old.`}
            action={
              <Button
                variant="outline"
                size="xs"
                disabled={!tracking.canSave}
                onClick={() => void editing.setEnabled(prompt, true)}
              >
                Turn on
              </Button>
            }
          />
        </section>
      )}
      {data.running && (
        <VisibilityStatus
          run={data.run}
          sync={undefined}
          time={config.time}
          canRun={tracking.canRun}
          onRun={() => data.runNow()}
          onStop={() => data.runNow(true)}
        />
      )}
      {!loaded || !data.visibilityLoaded ? (
        <DetailSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Named in"
              value={stats?.answers ? String(stats.mentioned) : "–"}
              unit={stats?.answers ? `of ${plural(stats.answers, "answer")}` : undefined}
              detail={`${stats?.mentionRate == null ? "–" : `${Math.round(stats.mentionRate)}%`} of the answers that came back`}
            />
            <Tile
              label="Average position"
              value={stats?.averagePosition == null ? "–" : `#${stats.averagePosition}`}
              detail={`when listed, ${plural(positioned, "answer")}`}
            />
            <Tile
              label="Links to you in"
              value={stats?.answers ? String(stats.cited) : "–"}
              unit={stats?.answers ? (stats.cited === 1 ? "answer" : "answers") : undefined}
              detail={`${domain.hostname} was a cited source`}
            />
            <Tile
              label="Named instead"
              value={stats?.namedInstead ?? "–"}
              detail="most often named when you aren't"
            />
          </div>
          <Card
            title="Last 30 days"
            subtitle="One mark per day and AI app. Empty days had no check."
            actions={<MarkLegend />}
          >
            {history ? (
              <PromptHistoryGrid history={history} engines={engines} onSelect={selectTab} />
            ) : (
              <p className="text-sm text-muted-foreground">Could not read this prompt's history.</p>
            )}
          </Card>
          <section className="flex flex-col rounded-xl border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-2 p-4 pb-2">
              <div>
                <h2 className="text-sm font-semibold">Latest answers</h2>
                <p className="text-xs text-muted-foreground">
                  What each AI app said the last time it was asked.
                </p>
              </div>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  <mark className="rounded-sm bg-primary/15 px-0.5 font-semibold text-primary">
                    {brand}
                  </mark>{" "}
                  you
                </span>
                <span>
                  <span className="text-foreground underline decoration-dotted underline-offset-4">
                    Brand
                  </span>{" "}
                  other brands
                </span>
              </span>
            </header>
            <div className="border-b px-4 pb-3">
              <ToggleGroup
                aria-label="AI app"
                value={selected ? [selected] : []}
                onValueChange={(values) => {
                  const engine = engines.find((e) => e === values[0]);
                  if (engine) selectTab(engine);
                }}
              >
                {engines.map((engine) => {
                  const latest = latestFor(engine);
                  return (
                    <Toggle key={engine} value={engine}>
                      <EngineMark latest={latest && markOf(latest.answer)} />
                      {engineLabel(engine)}
                    </Toggle>
                  );
                })}
              </ToggleGroup>
            </div>
            {selected && (
              <AnswerPanel
                key={selected}
                engine={selected}
                latest={latestFor(selected)}
                lastAnswered={history?.lastAnswered.find((l) => l.answer.engine === selected)}
                today={history?.to ?? ""}
                time={config.time}
                brand={brand}
                hostname={domain.hostname}
                canRun={tracking.canRun && !data.running}
                onRun={() => data.runNow()}
              />
            )}
          </section>
        </>
      )}
      <AddPromptDialog domain={domain} tracking={tracking} editing={editing} />
      <DeletePromptDialog
        prompt={deleting ? prompt : null}
        onClose={() => setDeleting(false)}
        editing={editing}
      />
    </>
  );
}

function Tile({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="truncate text-2xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading prompt" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} shape="card" className="h-24" />
        ))}
      </div>
      <Skeleton shape="card" className="h-40" />
      <Skeleton shape="card" className="h-72" />
    </div>
  );
}
