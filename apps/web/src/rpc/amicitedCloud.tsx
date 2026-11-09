import {
  DomainsSettings,
  NewDomainDialog,
  useDomains,
  useDomainConnection,
} from "../marketingDomains";
import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";
import { useThreadShell } from "../state/entities";
export { CloudPendingApprovals, CloudUnclaimedApprovals } from "./amicitedApprovals";
import { CloudDisclosure } from "./amicitedApprovals";

import { Switch } from "../components/ui/switch";
import { SettingsRow } from "../components/settings/settingsLayout";

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
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { AmicitedUpsellCard } from "@amicited/ui-cloud";
import { createUpsellGate } from "@amicited/cloud-client/upsell";
import { type Connection } from "@amicited/cloud-client/model";
import type { WinResult } from "@amicited/cloud-client/upsell";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { createLocalApi } from "../localApi";
import { MarketingButton } from "@amicited/ui-marketing";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
const CloudButton = ({ variant = "outline", ...props }: ComponentProps<typeof MarketingButton>) =>
  variant === "link" ? (
    <Button variant="link" {...props} />
  ) : (
    <MarketingButton variant={variant} {...props} />
  );

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
export { openCloudSubscription } from "../amicitedSubscription";
import { openCloudSubscription, useSubscriptionRefresh } from "../amicitedSubscription";
const status = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.status",
  label: "cloud:status",
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
function useCloud(destination?: import("@t3tools/contracts").EnvironmentId) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const ref = useThreadRouteRef();
  const shell = useThreadShell(ref);
  const projectId = shell?.projectId;
  const domain = useDomainConnection(environmentId, projectId);
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
  useSubscriptionRefresh(environmentId, projectId, (value) => {
    if (projectId) domain.setConnection(value);
    else setConnection(value);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read status from the destination environment on entry.
  useEffect(() => {
    if (!environmentId || projectId) return;
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
  }, [environmentId, projectId]);
  return {
    environmentId,
    projectId,
    domain,
    connection: projectId ? domain.connection : connection,
    setConnection: projectId ? domain.setConnection : setConnection,
  };
}
export function CloudFooter({
  result,
  destination,
}: {
  result: WinResult;
  destination?: import("@t3tools/contracts").EnvironmentId | undefined;
}) {
  const { environmentId, projectId, domain, connection, setConnection } = useCloud(destination);
  const domains = useDomains(environmentId);
  const [domainSetupOpen, setDomainSetupOpen] = useState(false);
  const doDisconnect = useAtomCommand(disconnect);

  const [gate] = useState(() => createUpsellGate(localStorage, sessionStorage));
  const [showTrial] = useState(() => gate.claim(result, Date.now()));
  if (!connection) return null;
  if (connection.state === "connected")
    return (
      <aside className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <p>
          <span>
            {connection.access === "full"
              ? "Connected · full AmICited access"
              : connection.access === "free"
                ? "Connected · no-plan checks available (uses credits)"
                : "Connected · access confirmed on your next check"}
          </span>
          {connection.access !== "full" && showTrial && (
            <>
              {" "}
              ·{" "}
              {/^content\./.test(result.tool)
                ? "This draft has no prompt or citation measurements."
                : "This one-time check has no daily citation history."}
            </>
          )}
        </p>
        {connection.access !== "full" && showTrial && (
          <CloudButton
            variant="link"
            onClick={() => openCloudSubscription(environmentId, projectId)}
          >
            Start 7-day free trial
          </CloudButton>
        )}
      </aside>
    );
  return (
    <>
      <NewDomainDialog
        open={domainSetupOpen}
        onOpenChange={setDomainSetupOpen}
        destination={environmentId}
      />
      <AmicitedUpsellCard
        result={result}
        gate={gate}
        connected={false}
        ui={ui}
        openExternal={openExternal}
        connection={connection}
        onCancel={() => {
          if (projectId) {
            void domain.update("disconnect");
            return;
          }
          if (environmentId)
            void doDisconnect({ environmentId, input: undefined }).then((r) => {
              if (r._tag === "Success") setConnection(r.value);
            });
        }}
        onConnect={() => {
          if (!projectId || !domains.rows.some((row) => row.projectId === projectId)) {
            setDomainSetupOpen(true);
            return;
          }
          void domain.update("oauth");
        }}
      />
    </>
  );
}
function CloudSettings() {
  return <DomainsSettings />;
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
        Connect for no-plan checks that use workspace credits; welcome credits cover new accounts. A
        trial or Pro adds daily tracking and the full set.
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
        Connect AmICited for checks using workspace credits: brand visibility across AI assistants,
        query fan-out, llms.txt, site health and watermark detection. A 7-day trial or Pro adds
        daily prompt and citation tracking, competitors, SEO reports and audits.
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
  return connection?.state === "connected" ? (
    <span>
      · <span>AmICited connected</span>
    </span>
  ) : null;
}
