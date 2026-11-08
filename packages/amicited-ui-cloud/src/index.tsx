import "./cloud.css";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
  type ComponentType,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { DOCS_URL, SUBSCRIPTION_URL, type Connection } from "@amicited/cloud-client/model";
import {
  subscribePromotions,
  promotionRevision,
  createUpsellGate,
  whatYouAreMissing,
  type WinResult,
} from "@amicited/cloud-client/upsell";

export interface CloudUi {
  Row?: ComponentType<{ title: ReactNode; description?: ReactNode; control?: ReactNode }>;
  Disclosure?: ComponentType<{ label: ReactNode; children: ReactNode }>;
  Group?: ComponentType<{ children: ReactNode }>;
  Button: ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: "default" | "outline" | "link";
      size?: "xs" | "sm";
    }
  >;
  Input: ComponentType<Omit<InputHTMLAttributes<HTMLInputElement>, "size">>;
}
export interface CloudActions {
  connectOAuth(): Promise<Connection>;
  connectApiKey(key: string): Promise<Connection>;
  disconnect(): Promise<Connection>;
}
type Gate = ReturnType<typeof createUpsellGate>;
export function AmicitedUpsellCard({
  result,
  gate,
  connected = false,
  ui: { Button },
  onConnect,
  connection,
  onCancel,
}: {
  result: WinResult;
  gate: Gate;
  connected?: boolean;
  ui: CloudUi;
  openExternal(url: string): void;
  onConnect(): void;
  connection?: Connection;
  onCancel?(): void;
}) {
  const [visible, setVisible] = useState(false);
  const claimed = useRef(false);
  // Synchronize the session claim with persistent browser storage after mounting.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The external gate persists snooze and session frequency.
  useEffect(() => {
    if (!claimed.current && gate.claim(result, Date.now(), connected)) {
      claimed.current = true;
      setVisible(true);
    }
  }, [gate, result, connected]);
  const [now] = useState(() => Date.now());
  const revision = useSyncExternalStore(subscribePromotions, promotionRevision, promotionRevision);
  const allowed = revision >= 0 && gate.eligible(true, now, connected);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Coordinate mounted contextual offers with the composer warning.
  useEffect(() => {
    if (!visible || connected || !allowed) return;
    const token = Symbol();
    activeOffers.add(token);
    offerListeners.forEach((listener) => listener());
    return () => {
      activeOffers.delete(token);
      offerListeners.forEach((listener) => listener());
    };
  }, [visible, connected, allowed]);
  const comparison = whatYouAreMissing(result);
  if (!visible || connected || !allowed || !comparison) return null;
  if (connection?.state === "connecting")
    return (
      <aside className="am-cloud-card">
        <p>Waiting for you to finish in your browser…</p>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </aside>
    );
  return (
    <aside aria-label="More with AmICited" className="am-cloud-card am-cloud-offer">
      <p>{comparison.missing}</p>
      {connection?.state === "error" && <p role="alert">{connection.message}</p>}
      <p className="am-hint">Optional 7-day trial, then EUR 120/month Pro for the full set.</p>
      <div className="am-cloud-actions">
        <Button variant="default" onClick={onConnect}>
          Connect AmICited (free)
        </Button>
        <Button
          variant="link"
          onClick={() => {
            gate.snooze(Date.now());
            setVisible(false);
          }}
        >
          Not now
        </Button>
      </div>
    </aside>
  );
}
export function AmicitedConnectPanel({
  connection,
  connectLabel = "Connect with AmICited",
  actions,
  onChange,
  openExternal,
  ui: { Button, Input, Disclosure = FallbackDisclosure, Group = FallbackGroup, Row = FallbackRow },
}: {
  connection: Connection;
  connectLabel?: string;
  actions: CloudActions;
  onChange(connection: Connection): void;
  openExternal(url: string): void;
  ui: CloudUi;
}) {
  const [trialOpened, setTrialOpened] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const operation = useRef(0);
  async function run(action: () => Promise<Connection>) {
    const id = ++operation.current;
    setBusy(true);
    setFailure(false);
    try {
      const result = await action();
      if (id === operation.current) onChange(result);
    } catch {
      if (id === operation.current) setFailure(true);
    } finally {
      if (id === operation.current) setBusy(false);
      setApiKey("");
    }
  }
  const pending = busy || connection.state === "connecting";
  return (
    <section aria-label="AmICited connection" className="am-cloud-stack">
      <Group>
        {connection.state === "connected" ? (
          <>
            <Row
              title={`Connected to ${connection.workspace}${connection.plan ? ` · ${connection.plan}` : ""}`}
              description={
                connection.state === "connected"
                  ? connection.access === "full"
                    ? "Full AmICited access is unlocked."
                    : connection.access === "free"
                      ? "No-plan checks use workspace credits; welcome credits cover new accounts."
                      : "We’ll confirm access on your next AmICited check."
                  : "Your local tools always work without an account."
              }
              control={
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(actions.disconnect)}
                >
                  Disconnect
                </Button>
              }
            />
            {connection.access !== "full" && (
              <Row
                title="Full AmICited access"
                description={
                  trialOpened
                    ? "Trial started? We’ll confirm on your next AmICited check."
                    : "Add daily prompt and citation tracking, competitor history and the full tool set. The 7-day trial needs a card, then continues at EUR 120/month."
                }
                control={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTrialOpened(true);
                      openExternal(SUBSCRIPTION_URL);
                    }}
                  >
                    Start 7-day free trial
                  </Button>
                }
              />
            )}
          </>
        ) : (
          <>
            {connection.state === "error" && (
              <div role="alert">
                <p>{connection.message}</p>
                {connection.kind === "plan_required" && (
                  <Button
                    onClick={() => {
                      setTrialOpened(true);
                      openExternal(SUBSCRIPTION_URL);
                    }}
                  >
                    Start 7-day free trial
                  </Button>
                )}
                {connection.kind === "no_credits" && (
                  <Button onClick={() => openExternal("https://app.flowhunt.io/")}>
                    Add credits in AmICited
                  </Button>
                )}
              </div>
            )}
            <Row
              title="Connection · Not connected"
              description="Your local tools always work without an account."
              control={
                pending ? null : (
                  <Button
                    variant="default"
                    disabled={pending}
                    onClick={() => void run(actions.connectOAuth)}
                  >
                    {connectLabel}
                  </Button>
                )
              }
            />
            {pending && (
              <div role="status">
                Waiting for you to finish in your browser…{" "}
                <Button variant="outline" onClick={() => void run(actions.disconnect)}>
                  Cancel
                </Button>
              </div>
            )}
            <Disclosure label="Use an API key instead">
              <p>Find your workspace key in AmICited settings.</p>
              <Button onClick={() => openExternal(DOCS_URL)}>Where to find your key</Button>
              <label>
                Workspace API key
                <Input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <Button
                disabled={pending || !apiKey.trim()}
                onClick={() => void run(() => actions.connectApiKey(apiKey))}
              >
                Connect with key
              </Button>
            </Disclosure>
          </>
        )}
        {failure && <p role="alert">We could not update the connection. Please try again.</p>}
        <Disclosure label="How this works">
          <p>
            AmICited shares your workspace through MCP. Sign-in stays in your browser and
            credentials stay in your computer’s secure storage. Connecting is free. One-off checks
            use workspace credits, covered by welcome credits for new accounts; no paid plan needed.
            A trial or Pro unlocks the full set.
          </p>
        </Disclosure>
      </Group>
    </section>
  );
}
export interface CloudHeadline {
  label: string;
  value: string | number;
}
export function AmicitedConnectedBadge({
  connection,
  domains,
  headlines = [],
  reportLink,
  openExternal,
  ui: { Button },
}: {
  connection: Connection;
  domains: readonly string[];
  headlines?: readonly CloudHeadline[];
  reportLink(): Promise<string>;
  openExternal(url: string): void;
  ui: CloudUi;
}) {
  const [error, setError] = useState(false);
  if (connection.state !== "connected") return null;
  async function open() {
    try {
      const url = new URL(await reportLink());
      if (url.protocol !== "https:") throw new Error();
      openExternal(url.href);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <section aria-label="AmICited connected" className="am-cloud-card am-cloud-offer">
      <h3>AmICited connected</h3>
      <p>{domains.length ? domains.join(", ") : "No domains tracked yet"}</p>
      {headlines.map((item) => (
        <p key={item.label}>
          {item.label}: <span className="am-number">{item.value}</span>
        </p>
      ))}
      <Button onClick={() => void open()}>Open in AmICited</Button>
      {error && <p role="alert">Could not open your report. Please try again.</p>}
    </section>
  );
}

function FallbackGroup({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
function FallbackDisclosure({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden>{open ? "⌄" : "›"}</span> <span>{label}</span>
      </button>
      <div hidden={!open}>{children}</div>
    </div>
  );
}

function FallbackRow({
  title,
  description,
  control,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div>
      <p>{title}</p>
      <p>{description}</p>
      {control}
    </div>
  );
}

export function DomainConnectionWarning({
  hostname,
  canConnect = true,
  storageKey,
  connection,
  onConnect,
  onCancel,
  ui: { Button },
}: {
  hostname: string;
  canConnect?: boolean;
  storageKey: string;
  connection: Connection | null;
  onConnect(): void;
  onCancel(): void;
  ui: Pick<CloudUi, "Button">;
}) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "hidden");
  const [now] = useState(() => Date.now());
  const revision = useSyncExternalStore(subscribePromotions, promotionRevision, promotionRevision);
  const offerVisible = useSyncExternalStore(subscribeOffers, hasOffer, () => false);
  const allowed =
    revision >= 0 && createUpsellGate(localStorage, sessionStorage).eligible(true, now);
  if (!connection || connection.state === "connected" || dismissed || !allowed || offerVisible)
    return null;
  return (
    <aside className="am-cloud-actions">
      <span aria-hidden="true">·</span>
      <span>
        {connection.state === "connecting"
          ? "Waiting for you to finish in your browser…"
          : "AmICited isn’t connected. Free local tools still work."}
      </span>
      {connection.state === "connecting" ? (
        <Button type="button" size="xs" variant="link" disabled={!canConnect} onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button type="button" size="xs" variant="link" disabled={!canConnect} onClick={onConnect}>
          Connect AmICited (free)
        </Button>
      )}
      <Button
        type="button"
        size="xs"
        variant="link"
        aria-label={`Dismiss AmICited warning for ${hostname}`}
        onClick={() => {
          localStorage.setItem(storageKey, "hidden");
          setDismissed(true);
        }}
      >
        Dismiss
      </Button>
      {connection.state === "error" && <span role="alert">{connection.message}</span>}
    </aside>
  );
}

const offerListeners = new Set<() => void>();
const activeOffers = new Set<symbol>();
const subscribeOffers = (listener: () => void) => {
  offerListeners.add(listener);
  return () => {
    offerListeners.delete(listener);
  };
};
const hasOffer = () => activeOffers.size > 0;
