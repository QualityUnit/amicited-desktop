/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns the report layout. */
import type { Domain } from "@amicited/cloud-client/domains";
import type { TrackingRun } from "@amicited/cloud-client/tracking";
import { MarketingLink } from "@amicited/ui-marketing";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../components/ui/collapsible";
import { Button } from "../components/ui/button";
import { engineLabel } from "./trackingPresentation";
export function FirstCheckReport({
  domain,
  run,
  canRun,
  onStop,
  onFix,
  onRetry,
  engineIds,
}: {
  domain: Domain;
  run: TrackingRun | undefined;
  canRun: boolean;
  onStop(): void;
  onFix(prompt: string): void;
  onRetry?(): void;
  engineIds?: readonly string[];
}) {
  if (!run) return null;
  const engines = engineIds?.length ? engineIds : [...new Set(run.answers.map((a) => a.engine))];
  const totalPerEngine = Math.round(run.total / (engines.length || 1));
  const answers = run.answers.filter((a) => a.status === "answered");
  const named = answers.filter((a) => a.mentioned).length;
  const visibility = run.visibility ?? (answers.length ? (named / answers.length) * 100 : null);
  const competitors = [...new Set(answers.flatMap((a) => a.competitorsMentioned))];
  const citations = answers.flatMap((a) => a.citations);
  const sources = [...new Set(citations)]
    .sort(
      (a, b) =>
        citations.filter((url) => url === b).length - citations.filter((url) => url === a).length,
    )
    .slice(0, 5);
  return (
    <section className="am-first-check" aria-label="First AI visibility check" aria-live="polite">
      <p>
        Tasks {run.answers.length}/{run.total} ·{" "}
        {run.status === "complete"
          ? run.outcome === "failed"
            ? "Could not complete this check"
            : run.outcome === "partial"
              ? "Check finished with partial results"
              : "First check finished"
          : run.status === "running"
            ? "Checking your prompts"
            : "Check interrupted · partial results saved"}
      </p>
      {run.status === "running" && (
        <p>
          I'm asking your prompts in the AI apps you connected, one question at a time. You can
          start another chat meanwhile; your results stay here.
        </p>
      )}
      {run.status === "running" && (
        <Button variant="ghost" disabled={!canRun} onClick={onStop}>
          Stop check
        </Button>
      )}
      <div className="am-check-summary">
        {run.status === "complete" && (
          <div>
            <strong>{visibility == null ? "Unavailable" : `${Math.round(visibility)}%`}</strong>
            <small>AI visibility</small>
          </div>
        )}
        {run.status === "complete" && (
          <div>
            <strong>
              {answers.some((a) => a.position !== null)
                ? `#${(answers.reduce((n, a) => n + (a.position ?? 0), 0) / answers.filter((a) => a.position !== null).length).toFixed(1)}`
                : "–"}
            </strong>
            <small>Average position</small>
          </div>
        )}
        <div className="am-check-engines">
          {engines.map((engine) => {
            const rows = run.answers.filter((a) => a.engine === engine);
            const checked = rows.filter((a) => a.status === "answered").length;
            const count =
              run.status === "complete" ? rows.filter((a) => a.mentioned).length : checked;
            return (
              <div key={engine}>
                <span>{engineLabel(engine)}</span>
                <span className="am-budget">
                  <span
                    style={{ width: `${totalPerEngine ? (count / totalPerEngine) * 100 : 0}%` }}
                  />
                </span>
                <small>
                  {count} of {totalPerEngine} {run.status === "running" ? "asked" : "named"}
                </small>
              </div>
            );
          })}
        </div>
      </div>
      {run.status === "complete" && (
        <>
          <p>
            AI named {domain.brand} in {named} of {answers.length} answers (
            {visibility == null ? "unavailable" : `${Math.round(visibility)}%`} visibility).
          </p>
          <p>Competitors recommended instead: {competitors.join(", ") || "None identified"}</p>
          <Collapsible>
            <CollapsibleTrigger>Top cited sources</CollapsibleTrigger>
            <CollapsiblePanel>
              {sources.map((url) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                </p>
              ))}
            </CollapsiblePanel>
          </Collapsible>
          <p>
            Possible next steps to discuss on {domain.hostname}. Ask your assistant to review the
            evidence before drafting anything that goes live.
          </p>
          {answers.length > 0 &&
            [
              `Draft a comparison page for ${domain.brand} and ${competitors.slice(0, 2).join(" and ") || "the alternatives buyers ask about"}`,
              "Add clear product and pricing facts to the homepage",
              `Outline a guide answering: ${answers.find((a) => !a.mentioned)?.prompt ?? answers[0]?.prompt ?? "buyers' common questions"}`,
            ].map((fix) => (
              <div className="am-check-fix" key={fix}>
                <span>{fix}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onFix(
                      `${fix}. Show a draft for approval before publishing. Read this check using amicited_tracking (run ${run.id}) and use its results as evidence.`,
                    )
                  }
                >
                  Draft it
                </Button>
              </div>
            ))}
        </>
      )}
      {onRetry &&
        run.status !== "running" &&
        (run.status !== "complete" || run.outcome === "failed") && (
          <Button variant="outline" disabled={!canRun} onClick={onRetry}>
            Resume check
          </Button>
        )}
      <MarketingLink href={`/prompts?site=${encodeURIComponent(domain.projectId)}`}>
        All answers and prompts
      </MarketingLink>
      {run.answers.some((a) => a.status === "needs_sign_in") && (
        <MarketingLink href="/marketing-settings">Sign in again in Connections</MarketingLink>
      )}
    </section>
  );
}
