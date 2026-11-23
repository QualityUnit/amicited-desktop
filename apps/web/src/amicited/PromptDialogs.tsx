import { useId, useState } from "react";
import type { Domain } from "@amicited/cloud-client/domains";
import type { TrackingConfig, TrackingEngine } from "@amicited/cloud-client/tracking";
import { newMessageId } from "../lib/utils";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Radio, RadioGroup } from "../components/ui/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toastManager } from "../components/ui/toast";
import { BudgetBar, type useTracking } from "./amicitedTracking";

type Tracking = ReturnType<typeof useTracking>;
type Prompt = TrackingConfig["prompts"][number];
export type PromptDialog = { mode: "add"; limited: boolean } | { mode: "turnOn"; prompt: Prompt };
const trialUrl = "https://app.flowhunt.io/amicited/subscription";

/**
 * The website's saved config, with each change saved at once. While a save is in flight the
 * page shows the change; a failure snaps it back.
 */
export function usePromptConfig(
  domain: Domain,
  tracking: Tracking,
  engines: readonly TrackingEngine[],
) {
  const saved = tracking.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const [pending, setPending] = useState<{
    base: TrackingConfig | undefined;
    next: TrackingConfig;
  } | null>(null);
  const config = pending && pending.base === saved ? pending.next : saved;
  const base: TrackingConfig = config ?? {
    projectId: domain.projectId,
    country: tracking.snapshot.country,
    time: "09:00",
    engines: [...engines],
    prompts: [],
  };
  const [dialog, setDialog] = useState<PromptDialog | null>(null);
  const persist = async (next: TrackingConfig, replacePromptId?: string) => {
    if (!tracking.environmentId) return "error" as const;
    setPending({ base: saved, next });
    const r = await tracking.save({
      environmentId: tracking.environmentId,
      input: { config: next, ...(replacePromptId ? { replacePromptId } : {}) },
    });
    if (r._tag === "Success" && r.value.status !== "limit_reached") return "saved" as const;
    setPending(null);
    if (r._tag === "Success") return "limit" as const;
    toastManager.add({ type: "error", title: "Could not save prompts. Please try again." });
    return "error" as const;
  };
  const withPrompt = (id: string, change: (p: Prompt) => Prompt) => ({
    ...base,
    prompts: base.prompts.map((p) => (p.id === id ? change(p) : p)),
  });
  return {
    saved,
    config,
    base,
    persist,
    dialog,
    setDialog,
    setEnabled: async (prompt: Prompt, enabled: boolean) => {
      const result = await persist(withPrompt(prompt.id, (p) => ({ ...p, enabled })));
      if (result === "limit" && enabled) setDialog({ mode: "turnOn", prompt });
    },
    remove: (prompt: Prompt) =>
      persist({ ...base, prompts: base.prompts.filter((p) => p.id !== prompt.id) }),
    withPrompt,
  };
}
export type PromptConfig = ReturnType<typeof usePromptConfig>;

/** Add a prompt, or turn one on, making room for it when the 20 free prompts are in use. */
export function AddPromptDialog({
  domain,
  tracking,
  editing,
}: {
  domain: Domain;
  tracking: Tracking;
  editing: PromptConfig;
}) {
  const dialog = editing.dialog;
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && editing.setDialog(null)}>
      <DialogPopup>
        {dialog && (
          <AddPromptForm
            key={dialog.mode === "turnOn" ? dialog.prompt.id : "add"}
            domain={domain}
            tracking={tracking}
            editing={editing}
            dialog={dialog}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function AddPromptForm({
  domain,
  tracking,
  editing,
  dialog,
}: {
  domain: Domain;
  tracking: Tracking;
  editing: PromptConfig;
  dialog: PromptDialog;
}) {
  const inputId = useId();
  const { usage, configs } = tracking.snapshot;
  const [text, setText] = useState("");
  const [limited, setLimited] = useState(
    dialog.mode === "turnOn" || dialog.limited || usage.used >= usage.limit,
  );
  const [scope, setScope] = useState<"here" | "other">("here");
  const [replace, setReplace] = useState("");
  const [busy, setBusy] = useState(false);
  const turningOn = dialog.mode === "turnOn";
  const trimmed = text.trim();
  const duplicate = editing.base.prompts.some(
    (p) => p.text.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const othersEnabled = configs.some(
    (c) => c.projectId !== domain.projectId && c.prompts.some((p) => p.enabled),
  );
  const hostnameOf = (projectId: string) =>
    usage.domains.find((d) => d.projectId === projectId)?.hostname ?? "";
  const candidates = configs
    .filter((c) =>
      scope === "here" ? c.projectId === domain.projectId : c.projectId !== domain.projectId,
    )
    .flatMap((c) =>
      c.prompts
        .filter((p) => p.enabled)
        .map((p) => ({ id: p.id, label: `${hostnameOf(c.projectId)} · ${p.text}` })),
    );
  const submit = async () => {
    setBusy(true);
    const next =
      dialog.mode === "turnOn"
        ? editing.withPrompt(dialog.prompt.id, (p) => ({ ...p, enabled: true }))
        : {
            ...editing.base,
            prompts: [
              ...editing.base.prompts,
              {
                id: newMessageId(),
                text: trimmed,
                enabled: true,
                created: new Date().toISOString(),
              },
            ],
          };
    const result = await editing.persist(next, replace || undefined);
    setBusy(false);
    if (result === "limit") setLimited(true);
    if (result === "saved") editing.setDialog(null);
  };
  const canSubmit =
    tracking.canSave &&
    !busy &&
    (turningOn || (trimmed !== "" && !duplicate)) &&
    (!limited || replace !== "");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{turningOn ? "Turn this prompt on" : "Add a prompt"}</DialogTitle>
        <DialogDescription>
          {limited
            ? `All ${usage.limit} free prompts are in use. Choose one to stop.`
            : `A question your buyers ask AI. It is checked every day for ${domain.hostname}.`}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {dialog.mode === "turnOn" ? (
          <p className="text-sm">{dialog.prompt.text}</p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>Prompt</Label>
            <Input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) void submit();
              }}
            />
          </div>
        )}
        {limited ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Make room for it</span>
            <RadioGroup
              aria-label="Make room for it"
              value={scope}
              onValueChange={(value) => {
                if (value === "here" || value === "other") {
                  setScope(value);
                  setReplace("");
                }
              }}
            >
              <ScopeChoice
                value="here"
                title={`Replace a ${domain.hostname} prompt`}
                detail="You choose which question stops."
              />
              <ScopeChoice
                value="other"
                disabled={!othersEnabled}
                title="Take one from another website"
                detail="One shared limit across your websites."
              />
            </RadioGroup>
            <Select value={replace} onValueChange={(value) => setReplace(value ?? "")}>
              <SelectTrigger aria-label="Choose a prompt to stop">
                <SelectValue placeholder="Choose a prompt to stop">
                  {candidates.find((c) => c.id === replace)?.label ?? "Choose a prompt to stop"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <p className="text-xs text-muted-foreground">
              Or keep all of them:{" "}
              <a
                href={trialUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Start 7-day trial ↗
              </a>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {usage.used} of {usage.limit} free prompts used <BudgetBar used={usage.used} />
            </span>
            <p className="text-xs text-muted-foreground">
              One limit for this computer, across all your websites. 20 a day keeps your own AI
              accounts working normally.
            </p>
          </div>
        )}
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button variant="ghost" onClick={() => editing.setDialog(null)}>
          Cancel
        </Button>
        <Button disabled={!canSubmit} onClick={() => void submit()}>
          {limited ? (turningOn ? "Replace and turn on" : "Replace and add") : "Add prompt"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ScopeChoice({
  value,
  title,
  detail,
  disabled = false,
}: {
  value: "here" | "other";
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm has-data-checked:border-primary has-data-checked:bg-primary/4">
      <Radio value={value} disabled={disabled} />
      <span className="flex flex-col">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

/** Delete stops a prompt for good; Turn off is offered beside it as the reversible choice. */
export function DeletePromptDialog({
  prompt,
  onClose,
  editing,
}: {
  prompt: Prompt | null;
  onClose: () => void;
  editing: PromptConfig;
}) {
  return (
    <AlertDialog open={prompt !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
          <AlertDialogDescription>
            "{prompt?.text}" stops being asked and leaves this list. To pause it and keep its
            history, turn it off instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          {prompt?.enabled && (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                void editing.setEnabled(prompt, false);
              }}
            >
              Turn off
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              if (prompt) void editing.remove(prompt);
              onClose();
            }}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
