import { OpenAI, ClaudeAI } from "../components/Icons";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../state/server";
import { getProviderSummary } from "../components/settings/providerStatus";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles. */
import { WorkLogRow } from "../components/chat/WorkLog";
import { PlugZap } from "lucide-react";
import { useState, useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { connectionCatalogue } from "@amicited/cloud-client/connections";
import { engineNeedsConnect } from "@amicited/cloud-client/tracking";
import type {
  BrowserChoice,
  ConnectionId,
  ConnectionsSnapshot,
} from "@amicited/cloud-client/connectionsRpc";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAmicitedAccount } from "./amicitedAccount";
import { ServerBrowserSurface } from "../browser/ServerBrowserSurface";
import { BrowserSurfaceSlot } from "../browser/BrowserSurfaceSlot";
import { previewRuntimeTabId } from "../browser/previewRuntimeTabId";
import { isElectron } from "../env";
import { useThreadPreviewState } from "../previewStateStore";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, type EnvironmentId } from "@t3tools/contracts";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../components/ui/collapsible";
import { MarketingLink } from "@amicited/ui-marketing";
import { BudgetBar } from "./amicitedTracking";
import { engineLabel } from "./trackingPresentation";
import { Checkbox } from "../components/ui/checkbox";
import { useDomains } from "../marketingDomains";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../components/ui/dialog";
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
const browserChoice = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.connections.useBrowser",
  label: "connections:useBrowser",
});
export function useConnections(destination?: EnvironmentId) {
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
    probe = useAtomCommand(check),
    choose = useAtomCommand(browserChoice);
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
  const chooseBrowser = async (use: BrowserChoice) => {
    if (!environmentId) return;
    const r = await choose({ environmentId, input: { use } });
    if (r._tag === "Failure")
      toastManager.add({ type: "error", title: "Could not change the browser. Please try again." });
  };
  return { snapshot, environmentId, allowed, act, chooseBrowser };
}
const labels = {
  connected: "Connected",
  signed_out: "Signed out",
  needs_attention: "Needs attention",
  not_set_up: "Not set up",
};
/** @public Onboarding composes this grid in slice 4. */
export function ConnectAiAppsGrid({
  excluded,
  onToggle,
}: {
  excluded: readonly string[];
  onToggle(engine: string): void;
}) {
  const state = useConnections();
  return (
    <section>
      <h2 className="am-section-label">AI apps to track</h2>
      <div className="am-engine-grid">
        {(["chatgpt", "perplexity", "gemini", "claude", "google_overviews", "google"] as const).map(
          (engine) => {
            const id = ["gemini", "google_overviews"].includes(engine) ? "google" : engine;
            const row = state.snapshot.connections.find((r) => r.id === id);
            const signInFree = !engineNeedsConnect(engine);
            const connected = signInFree || row?.status === "connected";
            return (
              <article className="am-engine-tile" key={engine}>
                <span className="am-engine-logo">
                  {engine === "chatgpt" ? (
                    <OpenAI />
                  ) : engine === "claude" ? (
                    <ClaudeAI />
                  ) : (
                    <span className="am-brand-avatar">
                      {engine === "perplexity" ? "PX" : engine === "gemini" ? "GE" : "G"}
                    </span>
                  )}
                </span>
                <strong>{engineLabel(engine)}</strong>
                {connected ? (
                  <label>
                    <Checkbox
                      checked={!excluded.includes(engine)}
                      onCheckedChange={() => onToggle(engine)}
                    />{" "}
                    Connected
                  </label>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!state.allowed}
                    onClick={() => void state.act("connect", id as ConnectionId)}
                  >
                    Connect
                  </Button>
                )}
                <small>
                  {signInFree
                    ? "No sign-in needed"
                    : connected
                      ? "Sign-in stays on this computer"
                      : "Sign in inside AmICited"}
                </small>
              </article>
            );
          },
        )}
      </div>
      <p className="am-muted">
        Apps that answer without a sign-in are on already. Connect the others to track them; your
        sign-ins stay on this computer. You can manage them later in Connections.
      </p>
      <h2 className="am-section-label">Available with AmICited</h2>
      <div className="am-engine-grid">
        {["Meta Muse", "Grok", "DeepSeek"].map((label) => (
          <article className="am-engine-tile" key={label}>
            <strong>{label}</strong>
            <a href="https://app.flowhunt.io/amicited/subscription">🔒 AmICited</a>
          </article>
        ))}
      </div>
      <p className="am-muted">
        These can't be reached from a personal sign-in. AmICited checks them in the cloud.
      </p>
      <ConnectionSignIn state={state} />
    </section>
  );
}
export function ConnectionsHub({ onboarding = false }: { onboarding?: boolean }) {
  const state = useConnections();
  const domains = useDomains();
  const { current } = useAmicitedAccount();
  const providers =
    useAtomValue(
      state.environmentId ? serverEnvironment.providersValueAtom(state.environmentId) : noProviders,
    ) ?? EMPTY_SERVER_PROVIDERS;
  const [selected, select] = useState<ConnectionId | null | undefined>(undefined);
  const query = useLocation({ select: (location) => location.searchStr });
  const requested = new URLSearchParams(query).get("connect");
  const connectRequested = useEffectEvent((id: ConnectionId) => {
    void state.act("connect", id);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- An Issue's reconnect destination opens the matching sign-in flow after navigation.
  useEffect(() => {
    const connection = connectionCatalogue.find(
      (c) => c.id === requested && c.availability === "local",
    );
    if (connection) connectRequested(connection.id);
  }, [requested]);
  const row = state.snapshot.connections.find(
    (r) => r.id === (selected === undefined ? requested : selected),
  );
  const detail = connectionCatalogue.find(
    (c) => c.id === (selected === undefined ? requested : selected),
  );
  return (
    <div className="am-page am-connections">
      <h1 className="sr-only">
        {onboarding ? "Connect your AI apps" : `${current?.name ?? "Workspace"} / Connections`}
      </h1>
      <p>
        AmICited asks your prompts in its own browser on this computer, signed in as you. Sign in
        once to each. Your agents ask first before anything goes public.
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
            row.usedBy.map((d) => (
              <p key={d.id}>
                {d.label} ·{" "}
                <MarketingLink href={`/prompts?site=${encodeURIComponent(d.id)}`}>
                  Open prompts
                </MarketingLink>
              </p>
            ))
          ) : (
            <p>Not used yet</p>
          )}
          {state.snapshot.usage && (
            <>
              <p>
                {state.snapshot.usage.used} of {state.snapshot.usage.limit} free prompts a day used
              </p>
              <BudgetBar used={state.snapshot.usage.used} />
            </>
          )}
          <h3>Recent activity</h3>
          <p>
            {row.lastUsed
              ? `Last used ${new Date(row.lastUsed).toLocaleString()}`
              : "No activity yet"}
          </p>
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
        ["tracking", "cloud", ...(!onboarding ? ["social"] : [])].map((group) =>
          group === "cloud" ? (
            <section className="am-card" key={group}>
              <h2>Available with AmICited</h2>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <strong>Meta Muse, Grok and DeepSeek</strong>
                  <p className="am-muted">
                    A personal sign-in can't reach these. AmICited checks them in the cloud.
                  </p>
                </div>
                <a href="https://app.flowhunt.io/amicited/subscription">
                  🔒 AmICited · Start 7-day trial
                </a>
              </div>
            </section>
          ) : (
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
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-4 border-b py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="am-engine-logo">
                          {c.id === "chatgpt" ? (
                            <OpenAI />
                          ) : c.id === "claude" ? (
                            <ClaudeAI />
                          ) : (
                            <span className="am-brand-avatar">
                              {c.id === "google" ? "G" : c.label.slice(0, 2)}
                            </span>
                          )}
                        </span>
                        <div>
                          <strong>{c.label}</strong>
                          <p>{r?.usedBy.map((d) => d.label).join(" · ") || "Not used yet"}</p>
                          <p className="am-muted">{c.permissions}</p>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <span className="am-muted">{r ? labels[r.status] : "Loading…"}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!state.allowed}
                            onClick={() =>
                              r?.status === "connected"
                                ? select(c.id)
                                : void state.act("connect", c.id)
                            }
                          >
                            {r?.status === "connected" ? "Connection details" : "Connect"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Details"
                            onClick={() => select(c.id)}
                          >
                            ⋯
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </section>
          ),
        )
      )}
      {!onboarding && !(row && detail) && <BrowserChoiceCard state={state} />}
      {!onboarding && (
        <>
          <section className="am-card">
            <h2>Your AI assistant</h2>
            {providers
              .filter((p) => p.driver === "codex" || p.driver === "claudeAgent")
              .map((p) => (
                <p key={p.instanceId}>
                  {p.displayName ?? p.driver} · {getProviderSummary(p).headline}
                </p>
              ))}
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event("amicited-assistant-setup"))}
            >
              Change assistant and view sign-in status
            </Button>
          </section>
          <section className="am-card">
            <h2>AmICited account</h2>
            <p>
              {current?.email} · {current?.name} · {current?.plan}
            </p>
            <MarketingLink href="/settings/general">Account</MarketingLink>
          </section>
        </>
      )}
      {!onboarding && (
        <section className="am-card">
          <h2>Website and CMS</h2>
          {domains.rows.map((d) => (
            <p key={d.projectId}>
              {d.hostname} · {d.siteFiles ? "Site files connected" : "Site files not connected"} ·{" "}
              <MarketingLink href="/marketing-settings">Connection details</MarketingLink>
            </p>
          ))}
        </section>
      )}
      <ConnectionSignIn state={state} />
    </div>
  );
}
function BrowserChoiceCard({ state }: { state: ReturnType<typeof useConnections> }) {
  const browser = state.snapshot.browser;
  if (!browser) return null;
  const own = browser.use === "connector";
  return (
    <section className="am-card">
      <h2>Browser</h2>
      <p>
        {own
          ? `Sign-ins and checks use your own browser, through the AmICited Connector. ${
              browser.connector ? `Connected in ${browser.connector}.` : browser.connectorSetup
            }`
          : "Sign-ins and checks use AmICited's built-in browser. Your sign-ins stay in it, on this computer."}
      </p>
      <Collapsible defaultOpen={own}>
        <CollapsibleTrigger>› Advanced</CollapsibleTrigger>
        <CollapsiblePanel>
          <p className="am-muted">
            {own
              ? "Switch back to sign in to each site again inside AmICited."
              : "If a site refuses to sign you in here, AmICited can use your own browser instead, through the AmICited Connector extension. You then sign in to each site there."}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!state.allowed}
            onClick={() => void state.chooseBrowser(own ? "app" : "connector")}
          >
            {own ? "Use AmICited's browser" : "Use my own browser"}
          </Button>
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}
/** The desktop app shows its own tab; elsewhere the server streams the page. */
function SignInPage({
  environmentId,
  threadId,
  tabId,
  layoutVersion,
}: {
  environmentId: EnvironmentId;
  threadId: string;
  tabId: string;
  layoutVersion: number;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const threadRef = scopeThreadRef(environmentId, ThreadId.make(threadId));
  const preview = useThreadPreviewState(threadRef);
  const native =
    isElectron && environmentId === primaryEnvironmentId && !preview.sessions[tabId]?.headless;
  if (!native)
    return (
      <ServerBrowserSurface
        environmentId={environmentId}
        threadId={threadId}
        tabId={tabId}
        visible
      />
    );
  const runtimeTabId = previewRuntimeTabId(threadRef, preview.serverEpoch, tabId);
  // Above the dialog, which would otherwise cover the page.
  return (
    <BrowserSurfaceSlot
      key={runtimeTabId}
      tabId={runtimeTabId}
      visible
      zIndex={70}
      layoutVersion={layoutVersion}
      className="h-full w-full"
    />
  );
}
function ConnectionSignIn({ state }: { state: ReturnType<typeof useConnections> }) {
  const [checking, setChecking] = useState(false);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const pending = state.snapshot.connections.find((r) => r.signingIn);
  if (!pending || !state.environmentId) return null;
  const label = connectionCatalogue.find((c) => c.id === pending.id)?.label;
  const cancel = () => void state.act("cancel", pending.id);
  const finish = async () => {
    setChecking(true);
    await state.act("finish", pending.id);
    setChecking(false);
    setCheckedFor(pending.id);
  };
  // Finish keeps the sign-in open when the page still looks signed out; say so instead of nothing.
  const notYet = !checking && checkedFor === pending.id && pending.status !== "connected";
  // Above the app shell: out of the window's drag strip, clear of its controls, over every container.
  if (pending.tabId && pending.threadId)
    return createPortal(
      <div
        role="dialog"
        aria-label={`Connect ${label}`}
        className="fixed inset-0 z-50 flex flex-col bg-background [-webkit-app-region:no-drag]"
      >
        <header
          className="flex items-center gap-3 border-b"
          style={{
            minHeight: "var(--workspace-topbar-height)",
            paddingLeft: "var(--workspace-controls-left, 0.75rem)",
            paddingRight: "var(--workspace-controls-right)",
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">Connect {label}</p>
            {notYet ? (
              <p role="alert" className="text-xs text-destructive">
                You're not signed in to {label} yet. Log in on the page below, then choose Finish
                connecting again.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sign in to {label} below, then choose Finish connecting. Your sign-in stays in
                AmICited, on this computer.
              </p>
            )}
          </div>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <Button disabled={checking} onClick={() => void finish()}>
            {checking ? "Checking…" : "Finish connecting"}
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <SignInPage
            environmentId={state.environmentId}
            threadId={pending.threadId}
            tabId={pending.tabId}
            layoutVersion={0}
          />
        </div>
      </div>,
      document.body,
    );
  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription>
            Sign in to {label} in the tab that opened in your browser.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <p>Waiting for you to sign in…</p>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={() => void finish()}>Finish connecting</Button>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
export function ConnectionChatCards({
  threadRef,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
}) {
  const state = useConnections(threadRef?.environmentId);
  const [dismissed, setDismissed] = useState<string[]>([]);
  return (
    <>
      {state.snapshot.requests
        .filter((r) => r.threadId === threadRef?.threadId && !dismissed.includes(r.connectionId))
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
            <Button
              variant="ghost"
              onClick={() => setDismissed((rows) => [...rows, r.connectionId])}
            >
              Not now
            </Button>
          </section>
        ))}
      <ConnectionSignIn state={state} />
    </>
  );
}
