import type { PromptHistory, TrackingEngine } from "@amicited/cloud-client/tracking";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { EngineMark } from "./EngineMark";
import { engineLabel } from "./trackingPresentation";
import { dayLabel } from "./visibilityFormat";

type Cell = PromptHistory["history"][number];

const daysFrom = (from: string, to: string) => {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 60;) {
    days.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return days;
};

const cellTooltip = (day: string, engine: string, cell: Cell | undefined) =>
  `${dayLabel(day)} · ${engineLabel(engine)} · ${
    !cell
      ? "no check"
      : cell.status !== "answered"
        ? `could not run${cell.reason ? `: ${cell.reason}` : ""}`
        : !cell.mentioned
          ? "not named"
          : cell.position
            ? `named, #${cell.position} in its list`
            : "named"
  }`;

/** One mark per day and AI app over the window, so a trend reads left to right. */
export function PromptHistoryGrid({
  history,
  engines,
  onSelect,
}: {
  history: PromptHistory;
  engines: readonly TrackingEngine[];
  onSelect: (engine: TrackingEngine) => void;
}) {
  const days = daysFrom(history.from, history.to);
  const cells = new Map(history.history.map((c) => [`${c.day}|${c.engine}`, c]));
  const columns = { gridTemplateColumns: `9rem repeat(${days.length}, minmax(0, 1fr)) 6rem` };
  return (
    <div role="table" aria-label="Last 30 days" className="flex flex-col gap-1 text-xs">
      <div role="row" className="grid items-end" style={columns}>
        <span role="columnheader" />
        {days.map((day, i) => {
          const last = i === days.length - 1;
          const labelled = last || (days.length - 1 - i) % 7 === 0;
          return (
            <span
              key={day}
              role="columnheader"
              className="overflow-visible text-center whitespace-nowrap text-muted-foreground"
            >
              {labelled ? (last ? "Today" : dayLabel(day)) : ""}
            </span>
          );
        })}
        <span role="columnheader" className="text-right text-muted-foreground">
          Named in
        </span>
      </div>
      {engines.map((engine) => {
        const answered = history.history.filter(
          (c) => c.engine === engine && c.status === "answered",
        );
        const positions = answered.flatMap((c) => (c.position === null ? [] : [c.position]));
        const average = positions.length
          ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
          : null;
        return (
          <div role="row" key={engine} className="grid items-center" style={columns}>
            <span role="rowheader" className="flex">
              <Button variant="ghost" size="xs" onClick={() => onSelect(engine)}>
                {engineLabel(engine)}
              </Button>
            </span>
            {days.map((day, i) => {
              const cell = cells.get(`${day}|${engine}`);
              return (
                <span
                  key={day}
                  role="cell"
                  className={`flex justify-center py-0.5 ${i === days.length - 1 ? "rounded-sm bg-primary/8" : ""}`}
                >
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex" />}>
                      <EngineMark large latest={cell} />
                    </TooltipTrigger>
                    <TooltipPopup>{cellTooltip(day, engine, cell)}</TooltipPopup>
                  </Tooltip>
                </span>
              );
            })}
            <span role="cell" className="text-right tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">
                {answered.filter((c) => c.mentioned).length}
              </span>{" "}
              of {answered.length}
              {average !== null && ` · #${average}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
