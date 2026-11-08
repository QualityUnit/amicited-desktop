import { WorkLogRow } from "../components/chat/WorkLog";
import { InlineButton } from "../components/ui/button";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";

import { ComposerPendingApprovalActions } from "../components/chat/ComposerPendingApprovalActions";
import { RuntimeRequestId } from "@t3tools/contracts";
import { Switch } from "../components/ui/switch";
import { SettingsRow } from "../components/settings/settingsLayout";

import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { SettingsGroup } from "../components/settings/SettingsGroup";
import { marketingNavigate } from "@amicited/ui-marketing";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes belong to @amicited/ui-marketing. */
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { AmicitedConnectPanel, AmicitedUpsellCard } from "@amicited/ui-cloud";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
import { type Connection } from "@amicited/cloud-client/model";
import type { WinResult } from "@amicited/cloud-client/upsell";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { createLocalApi } from "../localApi";
import { MarketingButton } from "@amicited/ui-marketing";
import { Input } from "../components/ui/input";
const CloudButton = (props: ComponentProps<typeof MarketingButton>) => (
  <MarketingButton {...props} />
);
function CloudDisclosure({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-2 text-sm text-muted-foreground">
        <ChevronRight className="size-3 group-data-open:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel animate={false}>{children}</CollapsiblePanel>
    </Collapsible>
  );
}
const ui = {
  Button: CloudButton,
  Input,
  Disclosure: CloudDisclosure,
  Row: SettingsRow,
  Group: SettingsGroup,
};
const openExternal = (url: string) => {
  void createLocalApi().shell.openExternal(url);
};
const connect = () => {
  sessionStorage.setItem("amicited.connect-requested", "true");
  marketingNavigate("/marketing-settings");
  window.dispatchEvent(new Event("amicited-connect"));
};
const resetAccess = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.resetAccess",
  label: "cloud:reset-access",
});
export function openCloudSubscription() {
  window.dispatchEvent(new Event("amicited-subscription-opened"));
  subscriptionPending = true;
  openExternal("https://app.flowhunt.io/amicited/subscription");
}
const approval = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.answerApproval",
  label: "cloud:approval",
});
const approvalStream = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.cloud.subscribeApprovals",
  label: "cloud:approvals",
  idleTtlMs: 0,
});
const emptyPending: readonly PendingCloudApproval[] = [];
type PendingCloudApproval = {
  requestId: string;
  threadId: string;
  tool: string;
  free: boolean;
  readOnly: boolean;
  arguments: Record<string, unknown>;
  message: string;
};
const noApprovals = Atom.make(AsyncResult.success(emptyPending));
export function useCloudApprovals(
  environmentId: import("@t3tools/contracts").EnvironmentId | null | undefined,
) {
  const value = useAtomValue(
    environmentId ? approvalStream({ environmentId, input: undefined }) : noApprovals,
  );
  return Option.getOrElse(AsyncResult.value(value), () => emptyPending);
}
export function CloudPendingApprovals({
  threadRef,
  tool,
  arguments: args,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
  tool?: unknown;
  arguments?: unknown;
}) {
  const requests = useCloudApprovals(threadRef?.environmentId);
  return requests
    .filter(
      (request) =>
        request.threadId === threadRef?.threadId &&
        (tool === undefined ||
          (request.tool === tool && JSON.stringify(request.arguments) === JSON.stringify(args))),
    )
    .map((request) => (
      <CloudApproval
        key={request.requestId}
        request={request}
        tool={request.tool}
        environmentId={threadRef?.environmentId}
      />
    ));
}
function CloudApproval({
  request,
  environmentId: destination,
}: {
  request: {
    requestId: string;
    message: string;
    free: boolean;
    readOnly?: boolean;
    arguments?: Record<string, unknown>;
  };
  tool: string;
  environmentId?: import("@t3tools/contracts").EnvironmentId | undefined;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = destination ?? primaryEnvironmentId;
  const answer = useAtomCommand(approval);
  const allowed = useAtomValue(approval.permissionAtom(environmentId));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  return (
    <aside aria-label="AmICited approval">
      <WorkLogRow label={request.message} wrapLabel>
        <div className="ms-7.5 flex flex-wrap items-center gap-2 text-xs">
          <span>Needs your OK</span>
          <ComposerPendingApprovalActions
            requestId={RuntimeRequestId.make(request.requestId)}
            isResponding={busy}
            canRespond={allowed}
            options={[
              { decision: "decline", label: "Don’t allow" },
              { decision: "accept", label: "Allow" },
            ]}
            onRespondToApproval={async (_, decision) => {
              if (
                !environmentId ||
                (decision !== "accept" && decision !== "decline" && decision !== "acceptForSession")
              )
                return;
              setBusy(true);
              const response = await answer({
                environmentId,
                input: { requestId: request.requestId, decision },
              });
              setBusy(false);
              if (response._tag !== "Success") setFailure(true);
            }}
          />
          {(request.free || request.readOnly) && (
            <InlineButton
              disabled={busy || !allowed}
              onClick={async () => {
                if (!environmentId) return;
                setBusy(true);
                const response = await answer({
                  environmentId,
                  input: { requestId: request.requestId, decision: "acceptForSession" },
                });
                if (response._tag !== "Success") {
                  setFailure(true);
                  setBusy(false);
                }
              }}
            >
              {request.free
                ? "Allow free checks in this chat"
                : "Allow AmICited lookups in this chat"}
            </InlineButton>
          )}
        </div>
        <details className="ms-7.5 text-xs">
          <summary>Inputs</summary>
          <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
        </details>
        {failure && (
          <p role="alert">Could not answer this approval. It may no longer be pending.</p>
        )}
      </WorkLogRow>
    </aside>
  );
}
const status = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.status",
  label: "cloud:status",
});
const oauth = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.connectOAuth",
  label: "cloud:oauth",
});
const key = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.connectApiKey",
  label: "cloud:key",
});
const disconnect = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.disconnect",
  label: "cloud:disconnect",
});
const cloudConnections = new Map<string, Connection>();
const cloudListeners = new Set<() => void>();
const subscribeCloud = (listener: () => void) => {
  cloudListeners.add(listener);
  return () => {
    cloudListeners.delete(listener);
  };
};
let subscriptionPending = false;
const focusRefreshers = new Set<() => void>();
const refreshSubscription = () => {
  if (!subscriptionPending) return;
  subscriptionPending = false;
  focusRefreshers.forEach((refresh) => refresh());
};
function useCloud(destination?: import("@t3tools/contracts").EnvironmentId) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const read = useAtomCommand(status);
  const reset = useAtomCommand(resetAccess);
  const readStatus = useEffectEvent(read);
  const connection = useSyncExternalStore(subscribeCloud, () =>
    environmentId ? (cloudConnections.get(environmentId) ?? null) : null,
  );
  const setConnection = (value: Connection) => {
    if (!environmentId) return;
    cloudConnections.set(environmentId, value);
    cloudListeners.forEach((listener) => listener());
  };
  const updateConnection = useEffectEvent(setConnection);
  const resetOnFocus = useEffectEvent(async () => {
    if (!environmentId || cloudConnections.get(environmentId)?.state !== "connected") return;
    const r = await reset({ environmentId, input: undefined });
    if (r._tag === "Success") updateConnection(r.value);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- A trial can start in the external browser while the app is unfocused.
  useEffect(() => {
    const refresh = () => void resetOnFocus();
    const evidence = (event: Event) => updateConnection((event as CustomEvent<Connection>).detail);
    if (import.meta.env.DEV) window.addEventListener("amicited-cloud-evidence", evidence);
    if (focusRefreshers.size === 0) window.addEventListener("focus", refreshSubscription);
    focusRefreshers.add(refresh);
    return () => {
      window.removeEventListener("amicited-cloud-evidence", evidence);
      focusRefreshers.delete(refresh);
      if (focusRefreshers.size === 0) window.removeEventListener("focus", refreshSubscription);
    };
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read status from the destination environment on entry.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void readStatus({ environmentId, input: undefined }).then((result) => {
      if (active)
        updateConnection(
          result._tag === "Success"
            ? result.value
            : {
                state: "error",
                kind: "network",
                message: "Could not read your AmICited connection. Try again.",
              },
        );
    });
    return () => {
      active = false;
    };
  }, [environmentId]);
  return { environmentId, connection, setConnection };
}
export function CloudFooter({
  result,
  destination,
}: {
  result: WinResult;
  destination?: import("@t3tools/contracts").EnvironmentId | undefined;
}) {
  const { environmentId, connection, setConnection } = useCloud(destination);
  const doOAuth = useAtomCommand(oauth);
  const doDisconnect = useAtomCommand(disconnect);

  const [gate] = useState(() => createUpsellGate(localStorage, sessionStorage));
  const [showTrial] = useState(() => gate.claim(result, Date.now()));
  if (!connection) return null;
  if (connection.state === "connected")
    return (
      <aside className="flex items-center gap-2 text-xs text-muted-foreground">
        <p>
          {connection.access === "full"
            ? "Connected · full AmICited access"
            : connection.access === "free"
              ? "Connected · no-plan checks available (uses credits)"
              : "Connected · access confirmed on your next check"}
        </p>
        {connection.access !== "full" && showTrial && (
          <span>
            {/^content\./.test(result.tool)
              ? "This draft has no prompt or citation measurements."
              : "This one-time check has no daily citation history."}
          </span>
        )}
        {connection.access !== "full" && showTrial && (
          <CloudButton variant="outline" onClick={openCloudSubscription}>
            Start 7-day free trial
          </CloudButton>
        )}
      </aside>
    );
  return (
    <AmicitedUpsellCard
      result={result}
      gate={gate}
      connected={false}
      ui={ui}
      openExternal={openExternal}
      connection={connection}
      onCancel={() => {
        if (environmentId)
          void doDisconnect({ environmentId, input: undefined }).then((r) => {
            if (r._tag === "Success") setConnection(r.value);
          });
      }}
      onConnect={() => {
        if (!environmentId) return;
        setConnection({ state: "connecting" });
        void doOAuth({ environmentId, input: undefined }).then((r) =>
          setConnection(
            r._tag === "Success"
              ? r.value
              : {
                  state: "error",
                  kind: "network",
                  message: "Could not connect AmICited. Please try again.",
                },
          ),
        );
      }}
    />
  );
}
function CloudSettings() {
  const { environmentId, connection, setConnection } = useCloud();
  const doOAuth = useAtomCommand(oauth);
  const doKey = useAtomCommand(key);
  const doDisconnect = useAtomCommand(disconnect);
  const canOAuth = useAtomValue(oauth.permissionAtom(environmentId));
  const canKey = useAtomValue(key.permissionAtom(environmentId));
  const canDisconnect = useAtomValue(disconnect.permissionAtom(environmentId));
  const startOAuth = useEffectEvent(async () => {
    if (
      !environmentId ||
      !canOAuth ||
      sessionStorage.getItem("amicited.connect-requested") !== "true"
    )
      return;
    sessionStorage.removeItem("amicited.connect-requested");
    setConnection({ state: "connecting" });
    const result = await doOAuth({ environmentId, input: undefined });
    if (result._tag === "Success") setConnection(result.value);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- External connect requests share the settings OAuth action.
  useEffect(() => {
    if (!environmentId || !canOAuth) return;
    void startOAuth();
    const start = () => void startOAuth();
    window.addEventListener("amicited-connect", start);
    return () => window.removeEventListener("amicited-connect", start);
  }, [environmentId, canOAuth]);
  if (!connection || !environmentId) return <p>Reading AmICited connection…</p>;
  return (
    <div className="am-cloud-settings">
      <fieldset disabled={connection.state === "connected" ? !canDisconnect : !canOAuth || !canKey}>
        <AmicitedConnectPanel
          connection={connection}
          ui={ui}
          openExternal={(url) =>
            url.includes("/subscription") ? openCloudSubscription() : openExternal(url)
          }
          onChange={setConnection}
          actions={{
            connectOAuth: async () => {
              const r = await doOAuth({ environmentId, input: undefined });
              if (r._tag !== "Success") throw new Error("Connection failed");
              return r.value;
            },
            connectApiKey: async (apiKey) => {
              const r = await doKey({ environmentId, input: { apiKey } });
              if (r._tag !== "Success") throw new Error("Connection failed");
              return r.value;
            },
            disconnect: async () => {
              const r = await doDisconnect({ environmentId, input: undefined });
              if (r._tag !== "Success") throw new Error("Disconnect failed");
              return r.value;
            },
          }}
        />
      </fieldset>
    </div>
  );
}
function promotionsAllowed(connection: Connection | null) {
  try {
    return (
      connection !== null &&
      createUpsellGate(localStorage, sessionStorage).eligible(
        localStorage.getItem("amicited.first-win") === "true",
        Date.now(),
        connection.state === "connected",
      )
    );
  } catch {
    return false;
  }
}
export function CloudToolPromotions({ connection }: { connection: Connection | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!promotionsAllowed(connection)) return null;
  return (
    <section className="am-card">
      <h2>Works better with AmICited</h2>
      <p>
        Connect for free brand visibility, query fan-out, llms.txt, site health and watermark
        detection. A trial or Pro adds daily tracking and the full set.
      </p>
      <div className="am-quick">
        {[
          "Daily prompt and citation tracking",
          "Competitor tracking",
          "SEO reports and audits",
        ].map((name) => (
          <MarketingButton
            variant="row"
            className="am-promo-row"
            key={name}
            aria-label={name + " →"}
            onClick={() => setSelected(name)}
          >
            <span>
              {name}
              <small className="am-promo-description">
                {name === "Daily prompt and citation tracking"
                  ? "Follow prompts and citations every day"
                  : name === "Competitor tracking"
                    ? "Compare your brand with competitors"
                    : "Review SEO reports and website audits"}
              </small>
            </span>
            <span aria-hidden="true">→</span>
          </MarketingButton>
        ))}
      </div>
      {selected && (
        <dialog
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setSelected(null)}
          aria-label={selected}
          className="am-cloud-sheet"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSelected(null);
          }}
        >
          <h2>{selected}</h2>
          <p>
            {selected === "Competitor tracking"
              ? "Track competitors alongside your brand."
              : selected === "SEO reports and audits"
                ? "Review SEO reports and website audits."
                : "Track prompts and citations every day. Keep a history so you can see what changes."}
          </p>
          <p>7-day trial, then EUR 120/month Pro, cancel anytime.</p>
          <CloudButton variant="default" onClick={connect}>
            Connect AmICited (free)
          </CloudButton>{" "}
          <CloudButton variant="link" autoFocus onClick={() => setSelected(null)}>
            Close
          </CloudButton>
        </dialog>
      )}
    </section>
  );
}

export function CloudPage() {
  const [hideMessage, setHideMessage] = useState("");
  const [offersHidden, setOffersHidden] = useState(() =>
    createUpsellGate(localStorage, sessionStorage).hidden(),
  );
  return (
    <section className="am-card am-cloud-page">
      <p className="am-hint">
        Connect AmICited for free tools for brand visibility across AI assistants, query fan-out,
        llms.txt, site health and watermark detection. A 7-day trial or Pro adds daily prompt and
        citation tracking, competitors, SEO reports and audits.
      </p>
      <CloudSettings />
      <SettingsGroup>
        <SettingsRow
          title="Hide trial offers"
          control={
            <Switch
              checked={offersHidden}
              onCheckedChange={() => {
                if (offersHidden) {
                  createUpsellGate(localStorage, sessionStorage).restore();
                  setOffersHidden(false);
                  setHideMessage("Trial offers are enabled.");
                  return;
                }
                const saved = createUpsellGate(localStorage, sessionStorage).dismiss();
                if (saved) setOffersHidden(true);
                setHideMessage(
                  saved
                    ? "Trial offers are permanently hidden."
                    : "Could not save your choice. Please try again.",
                );
              }}
            />
          }
        />
      </SettingsGroup>
      <p role="status">{hideMessage}</p>
    </section>
  );
}

export function CloudConnectedChip({
  destination,
}: {
  destination?: import("@t3tools/contracts").EnvironmentId | undefined;
}) {
  const { connection } = useCloud(destination);
  return connection?.state === "connected" ? <span>AmICited connected</span> : null;
}
