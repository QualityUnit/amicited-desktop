import { useEffect, useEffectEvent, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Clock, Globe, ScanEye } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { availableEngines } from "@amicited/cloud-client/tracking";
import type { DomainVisibility } from "@amicited/cloud-client/visibility";
import type { Domain } from "@amicited/cloud-client/domains";
import { marketingNavigate } from "@amicited/ui-marketing";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useDomains } from "../marketingDomains";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { SidebarMenuButton } from "../components/ui/sidebar";
import { Skeleton } from "../components/ui/skeleton";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { useTracking } from "./amicitedTracking";
import { useConnections } from "./amicitedConnections";
import { SetupTrackingPrompts } from "./SetupTrackingPrompts";
import { engineLabel } from "./trackingPresentation";
import { VisibilityDashboard } from "./VisibilityDashboard";
import { VisibilityStatus } from "./VisibilityStatus";
import { plural } from "./visibilityFormat";

const visibilityCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.visibility",
  label: "tracking:visibility",
});

const configured = (tracking: ReturnType<typeof useTracking>, projectId: string) =>
  tracking.snapshot.configs.some(
    (c) => c.projectId === projectId && c.prompts.some((p) => p.enabled),
  );

/** Sits under Issues; says "Set up" until a website tracks prompts. */
export function AiVisibilitySidebarRow({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const tracking = useTracking(environmentId ?? undefined);
  const domains = useDomains(environmentId);
  const needsSetup =
    tracking.loaded &&
    domains.rows.length > 0 &&
    !domains.rows.some((d) => configured(tracking, d.projectId));
  return (
    <div className="px-2 pb-1">
      <SidebarMenuButton
        isActive={active}
        render={<a href="/visibility" />}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        <ScanEye />
        <span className="flex-1">AI Visibility</span>
        {needsSetup && <span className="text-xs text-muted-foreground">Set up</span>}
      </SidebarMenuButton>
    </div>
  );
}

function useVisibility(environmentId: EnvironmentId | null, refreshKey: string) {
  const read = useEffectEvent(useAtomCommand(visibilityCommand));
  const [rows, setRows] = useState<readonly DomainVisibility[] | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Rereads the server's computed shares whenever a tracking run changes.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void read({ environmentId, input: {} }).then((r) => {
      if (active && r._tag === "Success") setRows(r.value);
    });
    return () => {
      active = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A tracking run changing is what changes the shares, so it rereads them.
  }, [environmentId, refreshKey]);
  return rows;
}

export function AiVisibilityPage() {
  const environmentId = usePrimaryEnvironmentId();
  const domains = useDomains(environmentId);
  const tracking = useTracking(environmentId ?? undefined);
  const { site } = useSearch({ strict: false }) as { site?: string };
  const refreshKey = tracking.snapshot.runs
    .map((r) => `${r.id}:${r.status}:${r.answered ?? r.answers.length}`)
    .join(";");
  const visibility = useVisibility(environmentId, refreshKey);
  const domain =
    domains.rows.find((d) => d.projectId === site) ??
    domains.rows.find((d) => configured(tracking, d.projectId)) ??
    domains.rows[0];
  const loading = !domains.loaded || !tracking.loaded;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">AI Visibility</h1>
        {domains.rows.length > 1 && domain && (
          <ToggleGroup
            aria-label="Website"
            value={[domain.projectId]}
            onValueChange={(values) => {
              if (values[0])
                marketingNavigate(`/visibility?site=${encodeURIComponent(String(values[0]))}`);
            }}
          >
            {domains.rows.map((d) => (
              <Toggle key={d.projectId} value={d.projectId}>
                {d.hostname}
              </Toggle>
            ))}
          </ToggleGroup>
        )}
      </header>
      {loading ? (
        <LoadingSkeleton />
      ) : !domain ? (
        <Empty>
          <EmptyMedia variant="icon">
            <Globe />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Add a website to see its AI visibility</EmptyTitle>
            <EmptyDescription>
              AmICited asks ChatGPT, Gemini, Perplexity and Google the questions your buyers ask,
              and shows how often they name and cite you.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        environmentId && (
          <DomainVisibilityView
            key={domain.projectId}
            domain={domain}
            environmentId={environmentId}
            tracking={tracking}
            visibility={visibility?.find((v) => v.projectId === domain.projectId) ?? null}
          />
        )
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading AI visibility" className="flex flex-col gap-3">
      <Skeleton shape="card" className="h-11" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} shape="card" className="h-24" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Skeleton shape="card" className="h-64" />
        <Skeleton shape="card" className="h-64" />
      </div>
    </div>
  );
}

function DomainVisibilityView({
  domain,
  environmentId,
  tracking,
  visibility,
}: {
  domain: Domain;
  environmentId: EnvironmentId;
  tracking: ReturnType<typeof useTracking>;
  visibility: DomainVisibility | null;
}) {
  const connections = useConnections(environmentId);
  const [settingUp, setSettingUp] = useState(false);
  const config = tracking.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const sync = tracking.snapshot.sync?.find((s) => s.projectId === domain.projectId);
  const latest = tracking.snapshot.runs.find((r) => r.projectId === domain.projectId);
  const running = latest?.status === "running";
  const engines = availableEngines(connections.snapshot.connections);
  const run = (stop?: boolean) =>
    void tracking.run({
      environmentId,
      input: { projectId: domain.projectId, ...(stop ? { stop } : {}) },
    });
  const openPrompts = () =>
    marketingNavigate(`/prompts?site=${encodeURIComponent(domain.projectId)}`);
  const brand = domain.brand || domain.hostname;
  const enabled = config?.prompts.filter((p) => p.enabled).length ?? 0;
  if (settingUp)
    return (
      <section className="rounded-xl border bg-card p-5">
        <SetupTrackingPrompts
          domain={domain}
          destination={environmentId}
          engines={engines}
          initialPrompts={[]}
          onBack={() => setSettingUp(false)}
          onComplete={async (saved) => {
            if (saved)
              await tracking.run({ environmentId, input: { projectId: domain.projectId } });
            setSettingUp(false);
          }}
        />
      </section>
    );
  if (!config || !enabled)
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <ScanEye />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>See how AI answers talk about {brand}</EmptyTitle>
          <EmptyDescription>
            Your assistant suggests the questions buyers ask about {domain.hostname}. The checks run
            on this computer every day, up to 20 prompts, free, on{" "}
            {engines.map(engineLabel).join(", ")}.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button disabled={!tracking.canSave} onClick={() => setSettingUp(true)}>
            Set up AI visibility
          </Button>
        </EmptyContent>
      </Empty>
    );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {domain.hostname} · {plural(enabled, "prompt")} ·{" "}
          {plural(config.engines.filter((e) => engines.includes(e)).length, "AI app")} · checked
          daily at {config.time} on this computer · last 30 days
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openPrompts}>
            Prompts and answers
          </Button>
          <Button size="sm" disabled={!tracking.canRun || running} onClick={() => run()}>
            Run now
          </Button>
        </div>
      </div>
      <VisibilityStatus
        run={latest}
        sync={sync}
        time={config.time}
        canRun={tracking.canRun}
        onRun={() => run()}
        onStop={() => run(true)}
      />
      {visibility && visibility.answers > 0 ? (
        <VisibilityDashboard
          visibility={visibility}
          config={config}
          run={latest}
          engines={engines}
          brand={brand}
          hostname={domain.hostname}
        />
      ) : (
        <Empty>
          <EmptyMedia variant="icon">
            <Clock />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {running ? "The first check is running" : `The first check runs at ${config.time}`}
            </EmptyTitle>
            <EmptyDescription>
              {running
                ? "Your prompts are asked one at a time on this computer. Results fill in here as answers arrive; you can keep working."
                : `Leave AmICited open at that time, or run it now. Each of the ${plural(enabled, "prompt")} is asked in every AI app.`}
            </EmptyDescription>
          </EmptyHeader>
          {!running && (
            <EmptyContent>
              <Button disabled={!tracking.canRun} onClick={() => run()}>
                Run now
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}
    </>
  );
}
