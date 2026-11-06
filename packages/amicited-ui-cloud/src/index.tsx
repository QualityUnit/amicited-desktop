import "./cloud.css";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { DOCS_URL, SIGNUP_URL, type Connection } from "@amicited/cloud-client/model";
import { createUpsellGate, whatYouAreMissing, type WinResult } from "@amicited/cloud-client/upsell";

export interface CloudUi {
  Button: ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "link" }
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
  openExternal,
  onConnect,
}: {
  result: WinResult;
  gate: Gate;
  connected?: boolean;
  ui: CloudUi;
  openExternal(url: string): void;
  onConnect(): void;
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
  const comparison = whatYouAreMissing(result);
  if (!visible || connected || !comparison) return null;
  return (
    <aside aria-label="More with AmICited" className="am-cloud-card am-cloud-stack">
      <h3>Keep building on this result</h3>
      <p>{comparison.checked}</p>
      <p className="text-ai-ink-3 text-[13px]">{comparison.missing}</p>
      <p>{comparison.pricing}</p>
      <div className="am-cloud-actions">
        <Button variant="default" onClick={() => openExternal(SIGNUP_URL)}>
          Start 7-day free trial
        </Button>
        <Button variant="outline" onClick={onConnect}>
          I already have AmICited
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
  actions,
  onChange,
  openExternal,
  ui: { Button, Input },
}: {
  connection: Connection;
  actions: CloudActions;
  onChange(connection: Connection): void;
  openExternal(url: string): void;
  ui: CloudUi;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  async function run(action: () => Promise<Connection>) {
    setBusy(true);
    setFailure(false);
    try {
      onChange(await action());
    } catch {
      setFailure(true);
    } finally {
      setBusy(false);
      setApiKey("");
    }
  }
  const pending = busy || connection.state === "connecting";
  return (
    <section aria-label="AmICited connection" className="am-cloud-stack">
      <p>Your local tools always work without an account.</p>
      {connection.state === "connected" ? (
        <>
          <p>
            Connected to {connection.workspace}
            {connection.plan ? ` · ${connection.plan}` : ""}
          </p>
          <Button disabled={busy} onClick={() => void run(actions.disconnect)}>
            Disconnect
          </Button>
        </>
      ) : (
        <>
          {connection.state === "error" && (
            <div role="alert">
              <p>{connection.message}</p>
              {connection.kind === "plan_required" && (
                <Button onClick={() => openExternal(SIGNUP_URL)}>Upgrade to Pro</Button>
              )}
              {connection.kind === "no_credits" && (
                <Button onClick={() => openExternal("https://app.flowhunt.io/")}>
                  Add credits in AmICited
                </Button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void run(actions.connectOAuth)}
          >
            {pending ? "Connecting…" : "Connect with AmICited"}
          </Button>
          <details>
            <summary>Use an API key instead</summary>
            <p>Find your workspace key on the AI agents page in AmICited.</p>
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
          </details>
        </>
      )}
      {failure && <p role="alert">We could not update the connection. Please try again.</p>}
      <details>
        <summary>How this works</summary>
        <p>
          AmICited shares your workspace through MCP. Sign-in stays in your browser and credentials
          stay in your computer’s secure storage. Pro or above is required.
        </p>
      </details>
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
    <section aria-label="AmICited connected" className="am-cloud-card am-cloud-stack">
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
