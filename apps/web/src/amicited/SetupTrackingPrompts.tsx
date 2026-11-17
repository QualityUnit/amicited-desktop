import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns the setup layout. */
import { useState, useEffect, useEffectEvent } from "react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type { TrackingConfig } from "@amicited/cloud-client/tracking";
import type { Domain } from "@amicited/cloud-client/domains";
import type { EnvironmentId } from "@t3tools/contracts";
import { newMessageId } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { useTracking, BudgetBar, LockPill } from "./amicitedTracking";
type SetupTrackingProps = {
  domain: Domain;
  destination: EnvironmentId;
  engines: readonly import("@amicited/cloud-client/tracking").TrackingEngine[];
  initialPrompts: readonly string[];
  onBack(): void;
  onComplete(config?: TrackingConfig): Promise<void>;
};
export function SetupTrackingPrompts(props: SetupTrackingProps) {
  const state = useTracking(props.destination);
  return state.loaded ? (
    <TrackingPromptsSetupForm {...props} state={state} />
  ) : (
    <p role="status">Loading prompts…</p>
  );
}
function TrackingPromptsSetupForm({
  domain,
  destination,
  engines,
  initialPrompts,
  onBack,
  onComplete,
  state,
}: SetupTrackingProps & { state: ReturnType<typeof useTracking> }) {
  const saved = state.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const [prompts, setPrompts] = useState<TrackingConfig["prompts"]>(
    () =>
      saved?.prompts ??
      initialPrompts.map((text) => ({
        id: newMessageId(),
        text,
        enabled: true,
        created: new Date().toISOString(),
      })),
  );
  const [time, setTime] = useState(saved?.time ?? "09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const suggest = useEffectEvent(state.suggest);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Suggestions come from the environment service once on entering setup.
  useEffect(() => {
    if ((saved || initialPrompts.length) && suggestionAttempt === 0) return;
    let active = true;
    void suggest({
      environmentId: destination,
      input: { projectId: domain.projectId, category: "" },
    }).then((r) => {
      if (!active) return;
      const failure =
        r._tag === "Failure" ? Option.getOrNull(Cause.findErrorOption(r.cause)) : null;
      const suggestions =
        r._tag === "Success"
          ? r.value
          : failure && "fallback" in failure
            ? (failure.fallback ?? [])
            : [];
      if (r._tag === "Failure")
        setError(
          "Your assistant couldn't suggest prompts. These are template suggestions; edit them for your website or try again.",
        );
      setPrompts(
        suggestions.map((text) => ({
          id: newMessageId(),
          text,
          enabled: true,
          created: new Date().toISOString(),
        })),
      );
    });
    return () => {
      active = false;
    };
  }, [destination, domain.projectId, saved, initialPrompts.length, suggestionAttempt]);
  const usedElsewhere =
    state.snapshot.usage.used - (saved?.prompts.filter((p) => p.enabled).length ?? 0);
  const finish = async (run: boolean) => {
    setBusy(true);
    setError("");
    try {
      const config = {
        projectId: domain.projectId,
        country: state.snapshot.country,
        time,
        engines,
        prompts,
      };
      const result = await state.save({ environmentId: destination, input: { config } });
      if (result._tag !== "Success") {
        setError("Could not save prompts. Please try again.");
        setBusy(false);
        return;
      }
      if (result.value.status === "limit_reached") {
        setError(
          "Make room for these prompts. One limit of 20 applies across all workspaces on this computer.",
        );
        setBusy(false);
        return;
      }
      await onComplete(run ? config : undefined);
    } catch {
      setError("Could not finish setup. Your saved prompts are safe; please try again.");
    }
    setBusy(false);
  };
  return (
    <section className="am-prompt-setup">
      <p className="am-muted">
        {initialPrompts.length
          ? `We started with the ${initialPrompts.length} prompts you already have in AmICited for ${domain.hostname}.`
          : `Your assistant suggests questions your buyers ask AI about ${domain.hostname}. Edit them or add your own.`}
      </p>
      <p>
        {usedElsewhere + prompts.filter((p) => p.enabled).length} of 20 free prompts a day · One
        limit for this computer, across workspaces
      </p>
      <BudgetBar used={usedElsewhere + prompts.filter((p) => p.enabled).length} />
      <div className="am-prompt-controls">
        <Menu>
          <MenuTrigger render={<Button variant="outline" size="sm" />}>
            Asked from {countryName(state.snapshot.country)} (this computer) ⌄
          </MenuTrigger>
          <MenuPopup>
            <MenuItem>{countryName(state.snapshot.country)} (this computer)</MenuItem>
            <MenuItem
              onClick={() =>
                window.open(
                  "https://app.flowhunt.io/amicited/subscription",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Other countries · 🔒 AmICited
            </MenuItem>
          </MenuPopup>
        </Menu>
        <label>
          Checked daily at{" "}
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="am-prompt-list">
        {prompts.map((p) => (
          <div key={p.id} className="am-prompt-row">
            <Checkbox
              aria-label={`Track ${p.text}`}
              checked={p.enabled}
              onCheckedChange={(enabled) =>
                setPrompts((rows) =>
                  rows.map((row) => (row.id === p.id ? { ...row, enabled } : row)),
                )
              }
            />
            {editing === p.id ? (
              <Input
                aria-label="Prompt"
                value={p.text}
                onChange={(e) =>
                  setPrompts((rows) =>
                    rows.map((row) => (row.id === p.id ? { ...row, text: e.target.value } : row)),
                  )
                }
                onBlur={() => setEditing(null)}
              />
            ) : (
              <span>{p.text}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditing(p.id)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPrompts((rows) => rows.filter((row) => row.id !== p.id))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={() =>
          setPrompts((rows) => [
            ...rows,
            { id: newMessageId(), text: "", enabled: true, created: new Date().toISOString() },
          ])
        }
      >
        Add a prompt
      </Button>
      <p>
        Other countries and more than 20 prompts a day run in the cloud. <LockPill />
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button variant="link" onClick={() => setSuggestionAttempt((n) => n + 1)}>
            Try again
          </Button>
        </p>
      )}
      <footer data-am="am-setup-footer">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={
              busy || !state.canSave || !prompts.length || prompts.some((p) => !p.text.trim())
            }
            onClick={() => void finish(false)}
          >
            Wait until {time}
          </Button>
          <Button
            disabled={
              busy ||
              !state.canRun ||
              !state.canSave ||
              !engines.length ||
              !prompts.length ||
              prompts.some((p) => !p.text.trim())
            }
            onClick={() => void finish(true)}
          >
            Run first check
          </Button>
        </div>
      </footer>
    </section>
  );
}

function countryName(country: string) {
  return country === "ZZ"
    ? "Location unavailable"
    : (new Intl.DisplayNames([navigator.language], { type: "region" }).of(country) ??
        "Location unavailable");
}
