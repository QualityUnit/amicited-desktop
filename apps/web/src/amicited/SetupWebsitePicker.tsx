/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles own these classes. */
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, Eye, Info, Plus, TriangleAlert } from "lucide-react";
import { normalizeDomain } from "@amicited/cloud-client/domainModel";
import type { AccountWorkspace, CloudWebsite } from "@amicited/cloud-client/rpc";
import type { EnvironmentId } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";

const listCloud = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.listCloud",
  label: "setup:cloud-websites",
});

type Workspace = typeof AccountWorkspace.Type;
type WebsiteResult =
  | { state: "loading" | "failed" }
  | { state: "loaded"; websites: readonly CloudWebsite[] };

export function useWebsiteLists(
  environmentId: EnvironmentId | null,
  workspaceIds: readonly string[],
) {
  const read = useAtomCommand(listCloud);
  const [lists, setLists] = useState<ReadonlyMap<string, WebsiteResult>>(() => new Map());
  const requested = useRef(new Set<string>());
  const load = async (workspaceId: string) => {
    if (!environmentId) return;
    requested.current.add(workspaceId);
    const update = (result: WebsiteResult) =>
      setLists((previous) => new Map(previous).set(workspaceId, result));
    update({ state: "loading" });
    try {
      const result = await read({ environmentId, input: { workspaceId } });
      update(
        result._tag === "Success"
          ? { state: "loaded", websites: result.value }
          : { state: "failed" },
      );
    } catch {
      update({ state: "failed" });
    }
  };
  const loadVisible = useEffectEvent(() => {
    for (const id of workspaceIds) {
      if (!requested.current.has(id)) void load(id);
    }
  });
  const visibleIds = JSON.stringify(workspaceIds);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Load the visible workspace catalogs independently from the environment.
  useEffect(() => {
    if (environmentId && visibleIds !== "[]") loadVisible();
  }, [environmentId, visibleIds]);
  return { lists, retry: load };
}

export function WorkspacePicker({
  workspaces,
  currentId,
  onSelect,
  disabled,
}: {
  workspaces: readonly Workspace[];
  currentId: string;
  onSelect(workspaceId: string): void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <section className="am-website-picker">
      <Input
        aria-label="Search workspaces"
        placeholder="Search workspaces"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="am-muted">No matching workspaces.</p>
      ) : (
        <ul className="am-website-list">
          {filtered.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                className="am-website-row am-workspace-choice"
                disabled={disabled}
                onClick={() => onSelect(workspace.id)}
              >
                <span className="am-brand-avatar" aria-hidden="true">
                  {workspace.name[0]?.toUpperCase()}
                </span>
                <span className="am-website-label">
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.plan}
                    {workspace.id === currentId && " · current"}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WebsiteGroup({
  workspace,
  result,
  current,
  grouped,
  pickDisabled,
  busy,
  onPick,
  onRetry,
}: {
  workspace: Workspace;
  result: WebsiteResult | undefined;
  current: boolean;
  grouped: boolean;
  pickDisabled: boolean;
  busy: boolean;
  onPick(website: CloudWebsite): void;
  onRetry(): void;
}) {
  const readOnly = workspace.canCreateDomains === false;
  const loading = !result || result.state === "loading";
  return (
    <section className="am-website-picker" aria-label={workspace.name}>
      {(grouped || readOnly || loading) && (
        <div className="am-website-group-header">
          {grouped && (
            <h2>
              <strong>{workspace.name}</strong> · {workspace.plan}
              {current && " · current"}
            </h2>
          )}
          {readOnly && (
            <span className="am-website-role">
              <Eye aria-hidden="true" size={12} />
              View only
            </span>
          )}
          {loading && <span role="status">Loading websites…</span>}
        </div>
      )}
      {loading && (
        <div className="am-website-list" aria-hidden="true">
          <div className="am-website-row am-website-placeholder">
            <span />
            <span />
            <span />
          </div>
          <div className="am-website-row am-website-placeholder">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      {result?.state === "failed" && (
        <div className="am-website-row am-website-error" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          <span className="am-website-label">Couldn't load this workspace's websites</span>
          <Button type="button" variant="outline" onClick={onRetry} disabled={busy}>
            Retry
          </Button>
        </div>
      )}
      {result?.state === "loaded" &&
        (result.websites.length ? (
          <ul className="am-website-list">
            {result.websites.map((website) => (
              <li className="am-website-row" key={`${workspace.id}:${website.hostname}`}>
                <span className="am-brand-avatar" aria-hidden="true">
                  {(website.brand ?? website.hostname)[0]?.toUpperCase()}
                </span>
                <span className="am-website-label">
                  {website.brand ? (
                    <>
                      <strong>{website.brand}</strong>
                      <small>{website.hostname}</small>
                    </>
                  ) : (
                    <strong>{website.hostname}</strong>
                  )}
                </span>
                <Button
                  type="button"
                  variant={!grouped || current ? "default" : "outline"}
                  disabled={pickDisabled}
                  onClick={() => onPick(website)}
                >
                  {!grouped || current ? "Pick" : "Switch and pick"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="am-muted">No websites in this workspace.</p>
        ))}
      {readOnly && result?.state === "loaded" && (
        <p className="am-muted">Ask a workspace owner or admin to add new websites.</p>
      )}
    </section>
  );
}

export function AddWebsiteButton({ onClick, disabled }: { onClick(): void; disabled: boolean }) {
  return (
    <button type="button" className="am-website-add" onClick={onClick} disabled={disabled}>
      <Plus aria-hidden="true" size={16} />
      Add a new website
    </button>
  );
}

export type WebsiteMatch = { website: CloudWebsite; workspaceName: string };
export const WebsiteMatchContext = createContext<{
  matches: readonly WebsiteMatch[];
  onPick(website: CloudWebsite): void;
  disabled: boolean;
} | null>(null);

export function AlreadyElsewhereNotice({
  website,
  children,
}: {
  website: string;
  children: ReactNode;
}) {
  const context = useContext(WebsiteMatchContext);
  const [dismissed, setDismissed] = useState<string>();
  if (!context) return children;
  let hostname: string;
  try {
    hostname = normalizeDomain(website).hostname;
  } catch {
    return children;
  }
  const match = context.matches.find((match) => match.website.hostname === hostname);
  if (!match || website === dismissed) return children;
  return (
    <div className="am-website-notice">
      <Info aria-hidden="true" size={18} />
      <div>
        <p role="status">
          <strong>{hostname}</strong> is already in <strong>{match.workspaceName}</strong>.
        </p>
        <div className="am-website-notice-actions">
          <Button
            type="button"
            disabled={context.disabled}
            onClick={() => context.onPick(match.website)}
          >
            Switch and use it
          </Button>
          <Button type="button" variant="link" onClick={() => setDismissed(website)}>
            or add it here too
          </Button>
        </div>
      </div>
    </div>
  );
}
