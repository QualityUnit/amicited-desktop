import type { TrackingAnswer } from "@amicited/cloud-client/tracking";
import { engineLabel } from "./trackingPresentation";
import { clock, dayOrToday } from "./visibilityFormat";

export interface MarkState {
  status: string;
  mentioned: boolean;
  position: number | null;
  capturedAt?: string | undefined;
  reason?: string | undefined;
}

/** A check's verdict as a mark: named with its position, named, not named, or could not run. */
export const markOf = (a: TrackingAnswer): MarkState => {
  const named =
    a.status === "answered" && !!(a.brand?.mentioned || a.domain?.mentioned || a.mentioned);
  return {
    status: a.status,
    mentioned: named,
    position: named ? (a.brand?.listPosition ?? a.position) : null,
    capturedAt: a.capturedAt,
    reason: a.reason,
  };
};

const verdict = (mark: MarkState) =>
  mark.status !== "answered"
    ? (mark.reason ?? "could not run")
    : !mark.mentioned
      ? "not named"
      : mark.position
        ? `named #${mark.position}`
        : "named";

/** "Gemini · named #5 · today 09:02", for a mark's tooltip. */
export const markTooltip = (engine: string, mark: MarkState | undefined, today?: string) =>
  mark
    ? [
        engineLabel(engine),
        verdict(mark),
        ...(mark.capturedAt
          ? [
              `${dayOrToday(new Date(mark.capturedAt).toLocaleDateString("en-CA"), today)} ${clock(mark.capturedAt)}`,
            ]
          : []),
      ].join(" · ")
    : `${engineLabel(engine)} · not asked yet`;

/**
 * Shape as well as colour: disc named (with its list position), ring not named, square could not
 * run, and a faint dot for a check not asked yet.
 */
export function EngineMark({
  latest,
  large = false,
}: {
  latest: MarkState | undefined;
  large?: boolean;
}) {
  const box = large ? "size-4.5" : "size-4";
  if (!latest)
    return (
      <span aria-label="Not asked yet" className={`inline-flex ${box} items-center justify-center`}>
        <span className="size-1 rounded-full bg-muted-foreground/40" />
      </span>
    );
  if (latest.status !== "answered")
    return (
      <span
        aria-label="Could not run"
        className={`inline-flex ${box} items-center justify-center rounded-sm bg-warning/20 text-3xs font-bold text-warning-foreground`}
      >
        !
      </span>
    );
  if (!latest.mentioned)
    return (
      <span
        aria-label="Not named"
        className={`inline-block ${box} rounded-full border-2 border-muted-foreground/40`}
      />
    );
  return (
    <span
      aria-label={latest.position ? `Named at #${latest.position}` : "Named"}
      className={`inline-flex ${box} items-center justify-center rounded-full bg-primary text-3xs font-semibold text-primary-foreground`}
    >
      {latest.position ?? ""}
    </span>
  );
}

export function MarkLegend() {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <EngineMark latest={{ status: "answered", mentioned: true, position: null }} /> Named, with
        list position
      </span>
      <span className="flex items-center gap-1.5">
        <EngineMark latest={{ status: "answered", mentioned: false, position: null }} /> Not named
      </span>
      <span className="flex items-center gap-1.5">
        <EngineMark latest={{ status: "failed", mentioned: false, position: null }} /> Could not run
      </span>
    </span>
  );
}
