import { marketingNavigate, MarketingLink } from "@amicited/ui-marketing";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes belong to @amicited/ui-marketing. */
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { useAtomValue } from "@effect/atom-react";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import {
  AmicitedConnectPanel,
  AmicitedConnectedBadge,
  AmicitedUpsellCard,
  type CloudHeadline,
} from "@amicited/ui-cloud";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
import { SIGNUP_URL, domainNames, type Connection } from "@amicited/cloud-client/model";
import type { ToolResult } from "@amicited/tools-core";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { createLocalApi } from "../localApi";
import { MarketingButton } from "@amicited/ui-marketing";
import { Input } from "../components/ui/input";
const CloudButton = (props: ComponentProps<typeof MarketingButton>) => (
  <MarketingButton {...props} />
);
const ui = { Button: CloudButton, Input };
const openExternal = (url: string) => {
  void createLocalApi().shell.openExternal(url);
};
const connect = () => marketingNavigate("/marketing-settings");
const status = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.status",
  label: "cloud:status",
});
const summary = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.summary",
  label: "cloud:summary",
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
function useCloud() {
  const environmentId = usePrimaryEnvironmentId();
  const read = useAtomCommand(status);
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
export function CloudFooter({ result }: { result: ToolResult }) {
  const { connection } = useCloud();
  const [gate] = useState(() => createUpsellGate(localStorage, sessionStorage));
  if (!connection) return null;
  return (
    <AmicitedUpsellCard
      result={result}
      gate={gate}
      connected={connection.state === "connected"}
      ui={ui}
      openExternal={openExternal}
      onConnect={connect}
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
  if (!connection || !environmentId) return <p>Reading AmICited connection…</p>;
  return (
    <div className="am-card">
      <fieldset disabled={connection.state === "connected" ? !canDisconnect : !canOAuth || !canKey}>
        <AmicitedConnectPanel
          connection={connection}
          ui={ui}
          openExternal={openExternal}
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
function headlinesFrom(value: unknown): CloudHeadline[] {
  return Array.isArray(value)
    ? value.filter(
        (v): v is CloudHeadline =>
          typeof v === "object" &&
          v !== null &&
          typeof v.label === "string" &&
          (typeof v.value === "string" || typeof v.value === "number"),
      )
    : [];
}
export function CloudHome({ offer = true }: { offer?: boolean }) {
  const { environmentId, connection } = useCloud();
  const read = useAtomCommand(summary);
  const readSummary = useEffectEvent(read);
  const [data, setData] = useState<{ domains: string[]; headlines: CloudHeadline[] }>({
    domains: [],
    headlines: [],
  });
  const connected = connection?.state === "connected";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fetch the remote workspace summary after reading connection state.
  useEffect(() => {
    if (!environmentId || !connected) return;
    let active = true;
    void readSummary({ environmentId, input: undefined }).then((r) => {
      if (active && r._tag === "Success")
        setData({
          domains: domainNames(r.value.domains),
          headlines: headlinesFrom(r.value.headlines),
        });
    });
    return () => {
      active = false;
    };
  }, [environmentId, connected]);
  if (!connection) return null;
  if (connection.state === "connected")
    return (
      <AmicitedConnectedBadge
        connection={connection}
        {...data}
        ui={ui}
        openExternal={openExternal}
        reportLink={async () => {
          if (!environmentId) throw new Error("Not connected");
          const r = await read({ environmentId, input: undefined });
          if (r._tag !== "Success" || !r.value.reportUrl) throw new Error("No report available");
          return r.value.reportUrl;
        }}
      />
    );
  return offer &&
    !createUpsellGate(localStorage, sessionStorage).hidden() &&
    localStorage.getItem("amicited.first-win") === "true" ? (
    <section className="am-card">
      <MarketingLink href="/marketing-settings">Track this daily with AmICited →</MarketingLink>
      <p>Keep your visibility history across assistants, countries and competitors.</p>
    </section>
  ) : null;
}
export function CloudTools() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <section className="am-card">
      <h2>Works better with AmICited</h2>
      <p>Optional cloud tracking alongside your free local tools.</p>
      <div className="am-quick">
        {["Daily AI visibility tracking", "Competitor citation gaps", "Multi-country tracking"].map(
          (name) => (
            <MarketingButton key={name} onClick={() => setSelected(name)}>
              {name} →
            </MarketingButton>
          ),
        )}
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
            {selected === "Competitor citation gaps"
              ? "Find prompts where competitors get cited and your brand is missing, then turn those gaps into useful content briefs."
              : selected === "Multi-country tracking"
                ? "See how recommendations change across your target countries, without changing your own location."
                : "Follow your citations across ChatGPT, Perplexity, Gemini and Google AI Overviews every day. Keep a history so you can see what improves."}
          </p>
          <p>7-day trial, then EUR 120/month Pro, cancel anytime.</p>
          <CloudButton variant="default" onClick={() => openExternal(SIGNUP_URL)}>
            Start 7-day free trial
          </CloudButton>{" "}
          <CloudButton variant="link" onClick={connect}>
            I already have AmICited
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
  const { connection } = useCloud();
  return (
    <div className="am-page">
      <h1>AmICited</h1>
      <p>
        See who cites you across ChatGPT, Perplexity, Gemini and Google AI Overviews. Track changes
        every day against your competitors.
      </p>
      {connection?.state !== "connected" && (
        <>
          <p>7-day trial, then EUR 120/month Pro, cancel anytime.</p>
          <MarketingButton variant="default" onClick={() => openExternal(SIGNUP_URL)}>
            Start 7-day free trial
          </MarketingButton>
        </>
      )}
      <CloudHome offer={false} />
      <CloudSettings />
      <MarketingButton
        variant="link"
        onClick={() => {
          const saved = createUpsellGate(localStorage, sessionStorage).dismiss();
          setHideMessage(
            saved
              ? "Trial offers are permanently hidden."
              : "Could not save your choice. Please try again.",
          );
        }}
      >
        Permanently hide trial offers
      </MarketingButton>
      <p role="status">{hideMessage}</p>
    </div>
  );
}

export function CloudStatusLine() {
  const { connection } = useCloud();
  return (
    <p>
      AmICited:{" "}
      {connection?.state === "connected"
        ? `Connected to ${connection.workspace}`
        : connection?.state === "error"
          ? "Could not read connection"
          : "Not connected"}
      . <MarketingLink href="/marketing-settings">Manage AmICited →</MarketingLink>
    </p>
  );
}
