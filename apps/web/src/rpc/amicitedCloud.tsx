import { Switch } from "../components/ui/switch";
import { SettingsRow } from "../components/settings/settingsLayout";
import { Badge } from "../components/ui/badge";
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
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { AmicitedConnectPanel, AmicitedUpsellCard } from "@amicited/ui-cloud";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
import { SIGNUP_URL, type Connection } from "@amicited/cloud-client/model";
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
  Row: ({ title, ...props }: ComponentProps<typeof SettingsRow>) => (
    <SettingsRow
      {...props}
      title={
        title === "Connection" ? (
          <span className="flex items-center gap-2">
            Connection <Badge variant="secondary">Not connected</Badge>
          </span>
        ) : (
          title
        )
      }
    />
  ),
  Group: SettingsGroup,
};
const openExternal = (url: string) => {
  void createLocalApi().shell.openExternal(url);
};
const connect = () => marketingNavigate("/marketing-settings");
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
export function CloudFooter({ result }: { result: WinResult }) {
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
    <div className="am-cloud-settings">
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
  const [offersHidden, setOffersHidden] = useState(() =>
    createUpsellGate(localStorage, sessionStorage).hidden(),
  );
  const { connection } = useCloud();
  return (
    <section className="am-card am-cloud-page">
      <p className="am-hint">
        Connect AmICited for free tools for brand visibility across AI assistants, query fan-out,
        llms.txt, site health and watermark detection. A 7-day trial or Pro adds daily prompt and
        citation tracking, competitors, SEO reports and audits.
      </p>
      <div className="am-actions">
        {promotionsAllowed(connection) && (
          <MarketingButton variant="default" onClick={() => openExternal(SIGNUP_URL)}>
            Start 7-day free trial
          </MarketingButton>
        )}
      </div>
      {promotionsAllowed(connection) && (
        <p className="am-hint">7-day trial, then EUR 120/month Pro, cancel anytime.</p>
      )}
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

export function CloudConnectedChip() {
  const { connection } = useCloud();
  return connection?.state === "connected" ? <span>AmICited connected</span> : null;
}
