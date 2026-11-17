import { Checkbox } from "../components/ui/checkbox";
import { AccountGateScreen, BrowserSignInPreview } from "./AccountGateScreen";
import { useIssues } from "../marketingIssues";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited setup classes are owned by the marketing package. */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { AmICitedMark, marketingNavigate } from "@amicited/ui-marketing";
import { useTracking, BudgetBar } from "./amicitedTracking";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { toastManager } from "../components/ui/toast";
import { publish } from "../marketingDomainStore";
import { useLocation } from "@tanstack/react-router";
const stream = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.account.subscribe",
  label: "account:subscribe",
  idleTtlMs: 0,
});
import type * as Schema from "effect/Schema";
import type { AccountStatus } from "@amicited/cloud-client/rpc";
const absent = Atom.make<
  AsyncResult.AsyncResult<Schema.Schema.Type<typeof AccountStatus>, unknown>
>(AsyncResult.initial());
const add = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.addWorkspace",
  label: "account:add",
});
const cancel = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.cancelSignIn",
  label: "account:cancel",
});
const reopen = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.reopenSignIn",
  label: "account:reopen",
});
const switchCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.switchWorkspace",
  label: "account:switch",
});
const remove = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.removeWorkspace",
  label: "account:remove",
});
const signOut = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.signOut",
  label: "account:signOut",
});
const older = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.older",
  label: "account:older",
});
const adopt = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.adopt",
  label: "account:adopt",
});
const noPermission = Atom.make(false);
const domains = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.list",
  label: "account:domains",
});
export function useAmicitedAccount() {
  const environmentId = usePrimaryEnvironmentId();
  const value = useAtomValue(environmentId ? stream({ environmentId, input: undefined }) : absent);
  const saved = Option.getOrElse(AsyncResult.value(value), () => null);
  const issues = useIssues(environmentId);
  const account = saved && {
    ...saved,
    workspaces: saved.workspaces.map((w) => ({
      ...w,
      attentionCount: Math.max(
        w.attentionCount,
        issues.issues.filter(
          (issue) => issue.status === "open" && w.projectIds?.includes(issue.projectId),
        ).length,
      ),
    })),
  };
  const current = account?.workspaces.find((w) => w.id === account.currentWorkspaceId);
  return { account, current, environmentId };
}
function useAccountActions() {
  const state = useAmicitedAccount();
  const doAdd = useAtomCommand(add),
    doCancel = useAtomCommand(cancel),
    doReopen = useAtomCommand(reopen),
    doSwitch = useAtomCommand(switchCommand),
    doRemove = useAtomCommand(remove),
    doSignOut = useAtomCommand(signOut);
  const { environmentId } = state;
  const canManage = useAtomValue(environmentId ? add.permissionAtom(environmentId) : noPermission);
  return {
    ...state,
    canManage,
    add: () => environmentId && doAdd({ environmentId, input: undefined }),
    cancel: () => environmentId && doCancel({ environmentId, input: undefined }),
    reopen: () => environmentId && doReopen({ environmentId, input: undefined }),
    switch: async (workspaceId: string) => {
      if (!environmentId) return;
      const result = await doSwitch({ environmentId, input: { workspaceId } });
      if (result._tag === "Success") {
        toastManager.add({
          type: "success",
          actionProps: {
            children: "Undo",
            onClick: () => {
              if (state.current)
                void doSwitch({ environmentId, input: { workspaceId: state.current.id } });
            },
          },
          title: `Switched to ${result.value.workspaces.find((w) => w.id === workspaceId)?.name}`,
        });
        marketingNavigate("/home");
      }
    },
    remove: (workspaceId: string) =>
      environmentId && doRemove({ environmentId, input: { workspaceId } }),
    signOut: () => environmentId && doSignOut({ environmentId, input: undefined }),
  };
}
export function AmicitedAccountGate({ children }: { children: ReactNode }) {
  const actions = useAccountActions();
  const readDomains = useEffectEvent(useAtomCommand(domains));
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | undefined>(undefined);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { account, current, environmentId } = actions;
  const currentId = account?.currentWorkspaceId;
  const previousWorkspace = useRef<string | undefined>(undefined);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Workspace changes invalidate the environment's scoped domain cache.
  useEffect(() => {
    if (!environmentId) return;
    publish(environmentId, []);
    if (!currentId) return;
    if (previousWorkspace.current && previousWorkspace.current !== currentId)
      marketingNavigate("/home");
    previousWorkspace.current = currentId;
    let active = true;
    void readDomains({ environmentId, input: undefined }).then((r) => {
      if (active && r._tag === "Success") {
        publish(environmentId, r.value);
        setLoadedWorkspaceId(currentId);
      }
    });
    return () => {
      active = false;
    };
  }, [environmentId, currentId]);
  if (["/pair", "/connect", "/connect-agent"].includes(pathname)) return children;
  if (!environmentId) return children;
  if (!account) return <main data-am="am-setup-loading">Connecting to your AmICited account…</main>;
  if (account.state === "signed_in" && currentId !== loadedWorkspaceId)
    return <main data-am="am-setup-loading">Loading {current?.name} workspace…</main>;
  if (account.state === "signed_in" && account.signingIn)
    return (
      <main data-am="am-setup" data-onboarding-surface="">
        <div data-am="am-setup-column">
          <div data-am="am-setup-brand">
            <AmICitedMark />
            <span className="am-muted">
              {current?.email} · {current?.name} workspace
            </span>
          </div>
          <nav data-am="am-setup-progress">Add workspace</nav>
          <header>
            <h1>Add another workspace</h1>
            <p className="am-muted">
              We opened AmICited in your browser. Choose the workspace to add there; this screen
              moves on by itself.
            </p>
          </header>
          <section data-am="am-setup-cloud">
            <p>Waiting for your browser…</p>
            <p className="am-muted">{current?.name} stays open in the app meanwhile</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => void actions.cancel()}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => void actions.reopen()}>
                Open the page again
              </Button>
            </div>
          </section>
          <BrowserSignInPreview
            email={current?.email}
            workspaces={account.workspaces.map((w) => w.name)}
          />
          <div className="flex-1" />
          <footer data-am="am-setup-footer">
            <Button variant="ghost" onClick={() => void actions.cancel()}>
              Back to {current?.name}
            </Button>
            <span className="am-muted">
              Each workspace keeps its own websites and chats. You switch in the sidebar.
            </span>
          </footer>
        </div>
      </main>
    );
  if (account.state === "signed_in") return <>{children}</>;
  return (
    <AccountGateScreen
      account={account}
      current={current}
      actions={actions}
      workspaceSwitcher={<WorkspaceSwitcher />}
    />
  );
}

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const actions = useAccountActions();
  if (!actions.account || !actions.current) return null;
  const { account, current } = actions;
  const attention = account.workspaces.some(
    (w) => w.id !== current.id && (w.attentionCount > 0 || w.sessionEnded),
  );
  return (
    <Menu>
      <MenuTrigger
        render={
          compact ? (
            <button type="button" className="am-workspace-chip" disabled={!actions.canManage} />
          ) : (
            <Button disabled={!actions.canManage} variant="ghost" />
          )
        }
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
          aria-hidden="true"
        >
          {current.name[0]?.toUpperCase()}
        </span>
        {compact
          ? `${current.email} · ${current.name}${/workspace$/i.test(current.name) ? "" : " workspace"} · Switch`
          : `${current.name} · ${current.plan}`}
        {attention && <span aria-label="Another workspace needs attention">●</span>}
        <span aria-hidden="true">⌄</span>
      </MenuTrigger>
      <MenuPopup>
        <p>{current.email}</p>
        {account.workspaces.map((w) => (
          <MenuItem key={w.id} onClick={() => void actions.switch(w.id)}>
            {w.id === current.id ? "✓ " : ""}
            {w.name} · {w.plan} · {w.websites.length} websites
            {w.sessionEnded ? " · Sign in again" : w.attentionCount > 0 ? " · ●" : ""}
          </MenuItem>
        ))}
        <MenuItem onClick={() => void actions.add()}>Add another workspace</MenuItem>
        <MenuItem onClick={() => marketingNavigate("/settings/general?section=workspaces")}>
          Manage workspaces
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
export function AccountSettings() {
  const actions = useAccountActions();
  const tracking = useTracking();
  const workspaces = useLocation({
    select: (location) => location.searchStr.includes("section=workspaces"),
  });
  const [confirmation, setConfirmation] = useState<{ workspaceId?: string } | null>(null);
  if (!actions.account) return null;
  return (
    <section className="am-card">
      <h2>Account</h2>
      <Button
        variant="ghost"
        onClick={() =>
          marketingNavigate(
            workspaces ? "/settings/general" : "/settings/general?section=workspaces",
          )
        }
      >
        {workspaces ? "Back to Account" : "Workspaces"}
      </Button>
      <p>{actions.current?.email}</p>
      <Button variant="outline" onClick={() => setConfirmation({})}>
        Sign out
      </Button>
      <section className="am-card">
        <h3>{actions.current?.plan} plan</h3>
        <p>
          {actions.current?.access === "full"
            ? "Daily tracking in the cloud"
            : "Daily tracking on this computer, through your own AI accounts"}
        </p>
        <a href="https://app.flowhunt.io/amicited/subscription">Start 7-day trial</a>
      </section>
      <OlderWebsites />
      {workspaces && (
        <>
          <h3>Workspaces on this computer</h3>
          <Button disabled={!actions.canManage} onClick={() => void actions.add()}>
            Add another workspace
          </Button>
          {actions.account.signingIn && (
            <p>
              Waiting for your browser…{" "}
              <Button variant="link" onClick={() => void actions.cancel()}>
                Cancel
              </Button>
              <Button variant="link" onClick={() => void actions.reopen()}>
                Open the sign-in page again
              </Button>
            </p>
          )}
          {actions.account.error && <p role="alert">{actions.account.error}</p>}
          {actions.account.workspaces.map((w) => (
            <article key={w.id}>
              <h3>
                {w.name} · {w.plan}
                {w.id === actions.current?.id ? " · Current" : ""}
              </h3>
              <p>
                {w.websites.length} websites: {w.websites.join(", ")}
              </p>
              <p className="am-muted">
                {w.access === "full"
                  ? "Tracked in the cloud · does not use this computer’s 20 a day"
                  : `Tracks on this computer · ${tracking.snapshot.usage.domains.filter((d) => w.projectIds?.includes(d.projectId)).reduce((n, d) => n + d.count, 0)} prompts a day`}
              </p>
              {w.id !== actions.current?.id && (
                <Button variant="outline" onClick={() => void actions.switch(w.id)}>
                  Switch
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirmation({ workspaceId: w.id })}>
                Remove from this computer
              </Button>
            </article>
          ))}
        </>
      )}
      <section className="am-card">
        <h3>Free tracking on this computer</h3>
        <p>
          {tracking.snapshot.usage.used} of 20 free prompts a day{" "}
          <BudgetBar used={tracking.snapshot.usage.used} />
        </p>
        <p>
          {tracking.snapshot.usage.domains.map((d) => `${d.hostname}: ${d.count}`).join(" · ") ||
            "No prompts yet"}
        </p>
        <p>
          {tracking.snapshot.usage.consumed} asked today. One limit for this computer, shared by
          every free workspace. Paid workspaces don’t use it.
        </p>
      </section>
      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.workspaceId ? "Remove from this computer?" : "Sign out?"}
            </DialogTitle>
            <DialogDescription>
              Your chats and files stay on this computer. Tracking pauses until you sign in again.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmation?.workspaceId) void actions.remove(confirmation.workspaceId);
                else void actions.signOut();
                setConfirmation(null);
              }}
            >
              Confirm
            </Button>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <p>
        Removing a workspace signs it out here and hides its websites. Its chats stay on this
        computer and return when you add it again.
      </p>
    </section>
  );
}

export function WorkspaceAttention() {
  const actions = useAccountActions();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const issues = useIssues(actions.environmentId);
  const other = actions.account?.workspaces.find(
    (w) => w.id !== actions.current?.id && w.attentionCount > 0 && !dismissed.includes(w.id),
  );
  if (!other) return null;
  return (
    <aside className="am-card">
      <p>
        {other.name} ·{" "}
        {issues.issues.find(
          (issue) => issue.status === "open" && other.projectIds?.includes(issue.projectId),
        )?.title ?? `${other.attentionCount} new Issues`}
      </p>
      <Button variant="link" onClick={() => void actions.switch(other.id)}>
        Switch to {other.name}
      </Button>
      <Button variant="ghost" onClick={() => setDismissed((rows) => [...rows, other.id])}>
        Later
      </Button>
      <Button
        variant="ghost"
        aria-label="Dismiss attention"
        onClick={() => setDismissed((rows) => [...rows, other.id])}
      >
        ×
      </Button>
    </aside>
  );
}

export function OlderWebsites({
  onCount,
  onComplete,
}: {
  onCount?(count: number): void;
  onComplete?(projectId: string): void;
}) {
  const { environmentId, current } = useAmicitedAccount();
  const read = useAtomCommand(older),
    doAdopt = useAtomCommand(adopt),
    readDomains = useAtomCommand(domains);
  const [rows, setRows] = useState<readonly import("@amicited/cloud-client/domains").Domain[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdopt = useAtomValue(environmentId ? adopt.permissionAtom(environmentId) : noPermission);
  const load = useEffectEvent(read);
  const countChanged = useEffectEvent((count: number) => onCount?.(count));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Older unassigned websites are loaded from the environment for adoption into the current workspace.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void load({ environmentId, input: undefined }).then((result) => {
      if (active && result._tag === "Success") {
        setRows(result.value);
        countChanged(result.value.length);
      }
    });
    return () => {
      active = false;
    };
  }, [environmentId]);
  const addWebsites = async (projectIds: readonly string[]) => {
    if (!environmentId || busy || !canAdopt || !projectIds.length) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    try {
      for (const projectId of projectIds) {
        const result = await doAdopt({ environmentId, input: { projectId } });
        if (result._tag === "Success") added.push(projectId);
        else
          setError(
            "Could not add every website. Your added websites are safe; try the others again.",
          );
      }
      const scoped = await readDomains({ environmentId, input: undefined });
      if (scoped._tag === "Success") publish(environmentId, scoped.value);
      setRows((previous) => previous.filter((row) => !added.includes(row.projectId)));
      onCount?.(rows.length - added.length);
      if (added.length === projectIds.length && added[0]) onComplete?.(added[0]);
    } catch {
      setError("Could not finish adding websites. Please try again.");
    }
    setBusy(false);
  };
  if (!rows.length || !current) return null;
  const checked = rows.filter((row) => !selected || selected.has(row.projectId));
  return (
    <form
      id={onComplete ? "amicited-onboarding-domain" : undefined}
      className="am-card"
      onSubmit={(event) => {
        event.preventDefault();
        void addWebsites(checked.map((row) => row.projectId));
      }}
    >
      {!onComplete && (
        <>
          <h2>We found {rows.length} websites on this computer</h2>
          <p>You set these up before accounts existed. Add them to AmICited to keep using them.</p>
        </>
      )}
      <div className="am-prompt-list">
        {rows.map((row) => (
          <div className="am-prompt-row" key={row.projectId}>
            {onComplete && (
              <Checkbox
                aria-label={`Add ${row.hostname}`}
                checked={!selected || selected.has(row.projectId)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected ?? rows.map((row) => row.projectId));
                  if (checked) next.add(row.projectId);
                  else next.delete(row.projectId);
                  setSelected(next);
                }}
              />
            )}
            <span className="am-brand-avatar">{row.brand[0]?.toUpperCase()}</span>
            <span>
              <strong>{row.hostname}</strong>
              <small className="block text-muted-foreground">{row.brand}</small>
            </span>
            {!onComplete && (
              <Button
                disabled={busy || !canAdopt}
                variant="outline"
                onClick={() => void addWebsites([row.projectId])}
              >
                Add to AmICited
              </Button>
            )}
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Adding websites to AmICited…</p>}
      <p className="am-muted">
        Your chats and files stay on this computer exactly as they are. A website you leave unticked
        stays here, but is hidden until you add it.
      </p>
    </form>
  );
}
