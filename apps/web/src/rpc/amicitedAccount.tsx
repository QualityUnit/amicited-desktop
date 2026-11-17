import { useIssues } from "../marketingIssues";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited setup classes are owned by the marketing package. */
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const readDomains = useAtomCommand(domains);
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
      if (active && r._tag === "Success") publish(environmentId, r.value);
    });
    return () => {
      active = false;
    };
  }, [environmentId, currentId, readDomains]);
  if (["/pair", "/connect", "/connect-agent"].includes(pathname)) return children;
  if (!account) return <main data-am="am-setup-loading">Connecting to your AmICited account…</main>;
  if (account.state === "signed_in")
    return (
      <>
        {account.signingIn && (
          <aside className="am-card" role="status">
            <h2>Add another workspace</h2>
            <p>Waiting for your browser… {current?.name} stays open in the app meanwhile.</p>
            <Button variant="outline" onClick={() => void actions.cancel()}>
              Cancel
            </Button>
            <Button variant="link" onClick={() => void actions.reopen()}>
              Open the sign-in page again
            </Button>
          </aside>
        )}
        {children}
      </>
    );
  const waiting = account.signingIn;
  const ended = account.state === "session_ended";
  return (
    <main data-am="am-setup" data-onboarding-surface="" aria-label="AmICited account">
      <div data-am="am-setup-column">
        <div data-am="am-setup-brand">
          <AmICitedMark />
        </div>
        {ended ? (
          <WorkspaceSwitcher />
        ) : (
          <nav data-am="am-setup-progress" aria-label="Setup progress">
            <span aria-current="step">Account</span>
            <span>Website</span>
            <span>Assistant</span>
            <span>AI apps</span>
            <span>Prompts</span>
          </nav>
        )}
        <header>
          <h1>
            {waiting
              ? "Finish signing in in your browser"
              : ended
                ? "Sign in again"
                : "Welcome to AmICited"}
          </h1>
          <p>
            {waiting
              ? "We opened the AmICited sign-in page. This screen moves on by itself when you are done."
              : ended
                ? "Your AmICited session ended. Sign in again; your local data is safe."
                : "Your AI workspace for marketing. From a question to a useful next step."}
          </p>
        </header>
        <section data-am="am-setup-cloud">
          {waiting ? (
            <>
              <h2>Waiting for your browser…</h2>
              <p>The page stays valid for 10 minutes</p>
              <Button variant="outline" onClick={() => void actions.cancel()}>
                Cancel
              </Button>
              <Button variant="link" onClick={() => void actions.reopen()}>
                Open the sign-in page again
              </Button>
            </>
          ) : (
            <>
              {ended ? (
                <>
                  <p>Your websites, chats, results and AI sign-ins are still here.</p>
                  <p>
                    Daily checks are paused until you sign in. Last signed in as {current?.email}.
                  </p>
                </>
              ) : (
                <>
                  <ul>
                    <li>
                      Track 20 prompts a day in ChatGPT, Perplexity, Gemini and more, free, on this
                      computer
                    </li>
                    <li>Works through the accounts you already have, in your own browser</li>
                    <li>Your assistant turns what it finds into fixes for your website</li>
                  </ul>
                  <p>
                    Sign in with a free AmICited account to start. The same button creates your
                    account if you don't have one yet. No card needed.
                  </p>
                </>
              )}
              <Button disabled={!actions.canManage} onClick={() => void actions.add()}>
                Continue with AmICited
              </Button>
            </>
          )}
          {account.error && <p role="alert">{account.error}</p>}
        </section>
        <p>
          {ended
            ? "No internet? The app keeps working offline while you are signed in."
            : "Sign in to continue. Your browser opens to finish."}
        </p>
      </div>
    </main>
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
      <MenuTrigger render={<Button disabled={!actions.canManage} variant="ghost" />}>
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
        <MenuItem onClick={() => marketingNavigate("/marketing-settings")}>
          Manage workspaces
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
export function AccountSettings() {
  const actions = useAccountActions();
  if (!actions.account) return null;
  return (
    <section className="am-card">
      <h2>Account and Workspaces</h2>
      <p>{actions.current?.email}</p>
      <Button variant="outline" onClick={() => void actions.signOut()}>
        Sign out
      </Button>
      <OlderWebsites />
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
          {w.id !== actions.current?.id && (
            <Button variant="outline" onClick={() => void actions.switch(w.id)}>
              Switch
            </Button>
          )}
          <Button variant="ghost" onClick={() => void actions.remove(w.id)}>
            Remove from this computer
          </Button>
        </article>
      ))}
      <p>
        Removing a workspace signs it out here and hides its websites. Its chats stay on this
        computer and return when you add it again.
      </p>
    </section>
  );
}

export function WorkspaceAttention() {
  const actions = useAccountActions();
  const other = actions.account?.workspaces.find(
    (w) => w.id !== actions.current?.id && w.attentionCount > 0,
  );
  if (!other) return null;
  return (
    <aside className="am-card">
      <p>
        {other.name} · {other.attentionCount} new Issues
      </p>
      <Button variant="link" onClick={() => void actions.switch(other.id)}>
        Switch to {other.name}
      </Button>
    </aside>
  );
}

export function OlderWebsites() {
  const { environmentId, current } = useAmicitedAccount();
  const read = useAtomCommand(older),
    doAdopt = useAtomCommand(adopt),
    readDomains = useAtomCommand(domains);
  const [rows, setRows] = useState<readonly import("@amicited/cloud-client/domains").Domain[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdopt = useAtomValue(environmentId ? adopt.permissionAtom(environmentId) : noPermission);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read unassigned websites from the destination environment on entry.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void read({ environmentId, input: undefined }).then((result) => {
      if (active && result._tag === "Success") setRows(result.value);
    });
    return () => {
      active = false;
    };
  }, [environmentId, read]);
  if (!rows.length || !current) return null;
  return (
    <section className="am-card">
      <h2>We found {rows.length} websites on this computer</h2>
      <p>You set these up before accounts existed. Add them to AmICited to keep using them.</p>
      {rows.map((row) => (
        <p key={row.projectId}>
          {row.hostname}{" "}
          <Button
            disabled={busy || !canAdopt}
            variant="outline"
            onClick={() => {
              if (!environmentId) return;
              setBusy(true);
              void doAdopt({ environmentId, input: { projectId: row.projectId } })
                .then(async (result) => {
                  if (result._tag === "Success") {
                    setRows((previous) => previous.filter((r) => r.projectId !== row.projectId));
                    const scoped = await readDomains({ environmentId, input: undefined });
                    if (scoped._tag === "Success") publish(environmentId, scoped.value);
                  } else setError("Could not add this website. Please try again.");
                })
                .finally(() => setBusy(false));
            }}
          >
            Add to AmICited
          </Button>
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      <p>
        Your chats and files stay on this computer exactly as they are. Older websites stay hidden
        until you add them.
      </p>
    </section>
  );
}
