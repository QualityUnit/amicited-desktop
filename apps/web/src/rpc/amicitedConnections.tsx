import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../state/server";
import { getProviderSummary } from "../components/settings/providerStatus";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles. */
import { WorkLogRow } from "../components/chat/WorkLog";
import { PlugZap } from "lucide-react";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { connectionCatalogue } from "@amicited/cloud-client/connections";
import type { ConnectionId, ConnectionsSnapshot } from "@amicited/cloud-client/connectionsRpc";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAmicitedAccount } from "./amicitedAccount";
import { ServerBrowserSurface } from "../browser/ServerBrowserSurface";
import { Button } from "../components/ui/button";
import { toastManager } from "../components/ui/toast";
const subscription = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.connections.subscribe",
  label: "connections",
  idleTtlMs: 0,
});
const empty = Atom.make(
  AsyncResult.success<ConnectionsSnapshot>({ connections: [], requests: [], usage: null }),
);
const unavailable = Atom.make(false);
const noProviders = Atom.make(EMPTY_SERVER_PROVIDERS);
const connect = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.connect",
  label: "connections:connect",
});
const cancel = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.cancel",
  label: "connections:cancel",
});
const finish = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.finish",
  label: "connections:finish",
});
const disconnect = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.disconnect",
  label: "connections:disconnect",
});
const check = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.check",
  label: "connections:check",
});
function useConnections(destination?: import("@t3tools/contracts").EnvironmentId) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = destination ?? primaryEnvironmentId;
  const result = useAtomValue(
    environmentId ? subscription({ environmentId, input: undefined }) : empty,
  );
  const snapshot = Option.getOrElse(
    AsyncResult.value(result),
    () => ({ connections: [], requests: [], usage: null }) as ConnectionsSnapshot,
  );
  const start = useAtomCommand(connect),
    stop = useAtomCommand(cancel),
    done = useAtomCommand(finish),
    remove = useAtomCommand(disconnect),
    probe = useAtomCommand(check);
  const allowed = useAtomValue(environmentId ? connect.permissionAtom(environmentId) : unavailable);
  const act = async (
    action: "connect" | "cancel" | "finish" | "disconnect" | "check",
    connectionId: ConnectionId,
    threadId = "amicited-connections",
  ) => {
    if (!environmentId) return;
    const r =
      action === "connect"
        ? await start({ environmentId, input: { connectionId, threadId } })
        : await { cancel: stop, finish: done, disconnect: remove, check: probe }[action]({
            environmentId,
            input: { connectionId },
          });
    if (r._tag === "Failure")
      toastManager.add({
        type: "error",
        title: "Could not update connection. Please try again.",
      });
  };
  return { snapshot, environmentId, allowed, act };
}
const labels = {
  connected: "Connected",
  signed_out: "Signed out",
  needs_attention: "Needs attention",
  not_set_up: "Not set up",
};
/** @public Onboarding composes this grid in slice 4. */
export function ConnectAiAppsGrid() {
  return <ConnectionsHub onboarding />;
}
export function ConnectionsHub({ onboarding = false }: { onboarding?: boolean }) {
  const state = useConnections();
  const { current } = useAmicitedAccount();
  const providers =
    useAtomValue(
      state.environmentId ? serverEnvironment.providersValueAtom(state.environmentId) : noProviders,
    ) ?? EMPTY_SERVER_PROVIDERS;
  const [selected, select] = useState<ConnectionId | null>(null);
  const row = state.snapshot.connections.find((r) => r.id === selected);
  const detail = connectionCatalogue.find((c) => c.id === selected);
  return (
    <div className="am-page">
      <h1>
        {onboarding ? "Connect your AI apps" : `${current?.name ?? "Workspace"} / Connections`}
      </h1>
      <p>
        AmICited asks your prompts in your own browser, signed in as you. Sign in once to each. Your
        agents ask first before anything goes public.
      </p>
      {row && detail ? (
        <section className="am-card">
          <Button variant="ghost" onClick={() => select(null)}>
            Back to Connections
          </Button>
          <h2>{detail.label}</h2>
          <p>{labels[row.status]}</p>
          <p>
            Last checked:{" "}
            {row.lastChecked ? new Date(row.lastChecked).toLocaleString() : "Not checked yet"}
          </p>
          <p>
            Last used: {row.lastUsed ? new Date(row.lastUsed).toLocaleString() : "Not used yet"}
          </p>
          <h3>What uses it</h3>
          {row.usedBy.length ? (
            row.usedBy.map((d) => <p key={d.id}>{d.label}</p>)
          ) : (
            <p>Not used yet</p>
          )}
          {state.snapshot.usage && (
            <>
              <p>
                {state.snapshot.usage.used} of {state.snapshot.usage.limit} free prompts a day used
              </p>
              <meter min={0} max={state.snapshot.usage.limit} value={state.snapshot.usage.used} />
            </>
          )}
          <h3>What agents may do</h3>
          <p>{detail.permissions}</p>
          <p>Changing your settings, chats or memory is not allowed.</p>
          <Button disabled={!state.allowed} onClick={() => void state.act("connect", row.id)}>
            Sign in again
          </Button>
          <Button
            variant="outline"
            disabled={!state.allowed}
            onClick={() => void state.act("disconnect", row.id)}
          >
            Disconnect
          </Button>
          <Button
            variant="ghost"
            disabled={!state.allowed}
            onClick={() => void state.act("check", row.id)}
          >
            Check sign-in
          </Button>
        </section>
      ) : (
        ["tracking", "cloud", ...(!onboarding ? ["social"] : [])].map((group) => (
          <section key={group} className="am-card">
            <h2>
              {
                {
                  tracking: "AI apps for tracking",
                  cloud: "Available with AmICited",
                  social: "Social",
                }[group]
              }
            </h2>
            {connectionCatalogue
              .filter((c) => c.group === group)
              .map((c) => {
                const r = state.snapshot.connections.find((r) => r.id === c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-4 border-b py-4">
                    <div>
                      <strong>{c.label}</strong>
                      <p>{r?.usedBy.map((d) => d.label).join(" · ") || "Not used yet"}</p>
                      <p>{c.permissions}</p>
                    </div>
                    {c.availability === "locked" ? (
                      <a
                        href="https://app.flowhunt.io/amicited/subscription"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AmICited · Start 7-day trial
                      </a>
                    ) : c.availability === "coming_soon" ? (
                      <span>Coming soon</span>
                    ) : (
                      <div>
                        <span>{r ? labels[r.status] : "Loading…"}</span>
                        <Button
                          variant="outline"
                          disabled={!state.allowed}
                          onClick={() =>
                            r?.status === "connected"
                              ? select(c.id)
                              : void state.act("connect", c.id)
                          }
                        >
                          {r?.status === "connected" ? "Connection details" : "Connect"}
                        </Button>
                        <Button variant="ghost" onClick={() => select(c.id)}>
                          Details
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
          </section>
        ))
      )}
      {!onboarding && (
        <>
          <section className="am-card">
            <h2>Your AI assistant</h2>
            {providers.map((p) => (
              <p key={p.instanceId}>
                {p.displayName ?? p.driver} · {getProviderSummary(p).headline}
              </p>
            ))}
            <a href="/settings/providers">View assistant sign-in and provider status</a>
          </section>
          <section className="am-card">
            <h2>AmICited account</h2>
            <p>
              {current?.email} · {current?.name} · {current?.plan}
            </p>
            <a href="/settings/account">Account</a>
          </section>
        </>
      )}
      <ConnectionSignIn state={state} />
    </div>
  );
}
function ConnectionSignIn({ state }: { state: ReturnType<typeof useConnections> }) {
  const pending = state.snapshot.connections.find((r) => r.signingIn);
  if (!pending || !state.environmentId) return null;
  return (
    <section role="dialog" aria-label="Connect account" className="am-card">
      <h2>Connect {connectionCatalogue.find((c) => c.id === pending.id)?.label}</h2>
      <p>Sign in on the site's own page below. Your sign-in stays on this computer.</p>
      {pending.tabId && pending.threadId && (
        <div style={{ height: 500 }}>
          <ServerBrowserSurface
            environmentId={state.environmentId}
            threadId={pending.threadId}
            tabId={pending.tabId}
            visible
          />
        </div>
      )}
      <p>Waiting for you to sign in…</p>
      <Button variant="outline" onClick={() => void state.act("cancel", pending.id)}>
        Cancel
      </Button>
      <Button onClick={() => void state.act("finish", pending.id)}>Finish connecting</Button>
    </section>
  );
}
export function ConnectionChatCards({
  threadRef,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
}) {
  const state = useConnections(threadRef?.environmentId);
  return (
    <>
      {state.snapshot.requests
        .filter((r) => r.threadId === threadRef?.threadId)
        .map((r) => (
          <section className="am-card" key={r.connectionId}>
            <WorkLogRow icon={<PlugZap className="size-3.5" />} label={r.message} wrapLabel />
            <p>
              Your sign-in stays on this computer. Agents only do what is listed in Connections.
            </p>
            <Button
              disabled={!state.allowed}
              onClick={() => void state.act("connect", r.connectionId, r.threadId)}
            >
              {r.connectionId === "linkedin" ? "Connect LinkedIn" : "Sign in again"}
            </Button>
          </section>
        ))}
      <ConnectionSignIn state={state} />
    </>
  );
}
