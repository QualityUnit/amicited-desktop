import { useAtomValue } from "@effect/atom-react";
import { SidebarProjectFolderHeader } from "./components/sidebar/SidebarProjectFolderHeader";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ReactNode } from "react";
import { DomainConnectionWarning, AmicitedConnectPanel } from "@amicited/ui-cloud";
import { useEffect, useRef, useEffectEvent, useState, useSyncExternalStore } from "react";
import type { Domain } from "@amicited/cloud-client/domains";
import { normalizeDomain } from "@amicited/cloud-client/domainModel";
import type { Connection } from "@amicited/cloud-client/model";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { readBrand } from "@amicited/ui-marketing";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import { usePrimaryEnvironmentId } from "./state/environments";
import { useProject, useProjects } from "./state/entities";
import { useOrchestrationCommand } from "./state/use-orchestration-command";
import { createLocalApi } from "./localApi";
import { projectEnvironment } from "./state/projects";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./components/ui/menu";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogPanel,
} from "./components/ui/dialog";
import { toastManager } from "./components/ui/toast";
import { SettingsGroup } from "./components/settings/SettingsGroup";
import { SettingsRow } from "./components/settings/settingsLayout";
const list = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.list",
  label: "domains:list",
});
const save = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.save",
  label: "domains:save",
});
const statusCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.status",
  label: "domains:status",
});
const reuseCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.reuse",
  label: "domains:reuse",
});
const connectionCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.connection",
  label: "domains:connection",
});
const cache =
  (import.meta.hot?.data.domainCache as Map<string, readonly Domain[]> | undefined) ??
  new Map<string, readonly Domain[]>();
const listeners = new Set<() => void>();
const empty: readonly Domain[] = [];
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(environmentId: string, rows: readonly Domain[]) {
  cache.set(environmentId, rows);
  listeners.forEach((listener) => listener());
}
export function readDomain(environmentId: string, projectId: string | undefined) {
  return cache.get(environmentId)?.find((domain) => domain.projectId === projectId);
}
export function useDomains(destination?: EnvironmentId | null) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const read = useAtomCommand(list);
  const rows = useSyncExternalStore(subscribe, () =>
    environmentId ? (cache.get(environmentId) ?? empty) : empty,
  );
  const refresh = useEffectEvent(async () => {
    if (!environmentId) return;
    const result = await read({ environmentId, input: undefined });
    if (result._tag === "Success") publish(environmentId, result.value);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Metadata is read from the connected environment.
  useEffect(() => {
    if (environmentId) void refresh();
  }, [environmentId]);
  return { rows, environmentId, refresh };
}
export function NewDomainDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(value: boolean): void;
}) {
  const { environmentId, refresh } = useDomains();
  const create = useAtomCommand(projectEnvironment.createNew);
  const register = useAtomCommand(save);
  const canCreate = useAtomValue(projectEnvironment.createNew.permissionAtom(environmentId));
  const canSave = useAtomValue(save.permissionAtom(environmentId));
  const newThread = useNewThreadHandler();
  const [website, setWebsite] = useState("");
  const [brand, setBrand] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingProject = useRef<{
    environmentId: EnvironmentId;
    hostname: string;
    projectId: ProjectId;
  } | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>New domain</DialogTitle>
          <DialogDescription>
            Keep this website’s chats and AmICited connection together.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!environmentId || busy || !canCreate || !canSave) return;
              void (async () => {
                setBusy(true);
                setError("");
                const domain = normalizeDomain(website, brand);
                let projectId =
                  pendingProject.current?.environmentId === environmentId &&
                  pendingProject.current.hostname === domain.hostname
                    ? pendingProject.current.projectId
                    : undefined;
                if (!projectId) {
                  const created = await create({ environmentId, input: { name: domain.hostname } });
                  if (created._tag !== "Success") {
                    setError("Could not create this domain. Please try again.");
                    return;
                  }
                  projectId = created.value.projectId;
                  pendingProject.current = { environmentId, hostname: domain.hostname, projectId };
                }
                const result = await register({
                  environmentId,
                  input: {
                    projectId,
                    website: domain.hostname,
                    brand: domain.brand,
                  },
                });
                if (result._tag !== "Success") {
                  setError(
                    "The folder was created, but its domain could not be saved. Please try again.",
                  );
                  return;
                }
                pendingProject.current = null;
                await refresh();
                onOpenChange(false);
                setWebsite("");
                setBrand("");
                await newThread(scopeProjectRef(environmentId, projectId));
              })()
                .catch((error) =>
                  setError(
                    error instanceof Error ? error.message : "Could not create this domain.",
                  ),
                )
                .then(() => setBusy(false));
            }}
          >
            <label>
              Website
              <Input
                required
                autoFocus
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="acme.com"
              />
            </label>
            <label>
              Brand name (optional)
              <Input value={brand} onChange={(event) => setBrand(event.target.value)} />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !canCreate || !canSave}>
                {busy ? "Creating…" : "Create domain"}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
const connections =
  (import.meta.hot?.data.domainConnections as Map<string, Connection> | undefined) ??
  new Map<string, Connection>();
if (import.meta.hot)
  import.meta.hot.dispose((data) => {
    data.domainCache = cache;
    data.domainConnections = connections;
  });
export function useDomainConnection(
  destination: EnvironmentId | null | undefined,
  projectId: string | null | undefined,
) {
  const run = useAtomCommand(connectionCommand);
  const read = useAtomCommand(statusCommand);
  const key = `${destination}:${projectId}`;
  const connection = useSyncExternalStore(subscribe, () => connections.get(key) ?? null);
  const setConnection = (value: Connection) => {
    connections.set(key, value);
    listeners.forEach((listener) => listener());
  };
  const update = useEffectEvent(async (action: "status" | "oauth" | "disconnect") => {
    if (!destination || !projectId) return;
    if (action === "oauth") setConnection({ state: "connecting" });
    const result =
      action === "status"
        ? await read({ environmentId: destination, input: { projectId } })
        : await run({ environmentId: destination, input: { projectId, action } });
    setConnection(
      result._tag === "Success"
        ? result.value
        : {
            state: "error",
            kind: "network",
            message: "Could not read this domain’s AmICited connection.",
          },
    );
  });
  const applyEvidence = useEffectEvent((value: Connection) => setConnection(value));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Capture fixtures exercise real domain settings without a production account.
  useEffect(() => {
    if (!import.meta.env.DEV || !destination || !projectId) return;
    const evidence = (event: Event) => applyEvidence((event as CustomEvent<Connection>).detail);
    window.addEventListener("amicited-cloud-evidence", evidence);
    return () => window.removeEventListener("amicited-cloud-evidence", evidence);
  }, [destination, projectId]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Connection state lives in the destination server's keyring.
  useEffect(() => {
    if (destination && projectId) void update("status");
  }, [destination, projectId]);
  return { connection, update, setConnection };
}
export function DomainConnection({
  domain,
  destination,
  quiet = false,
}: {
  domain: Domain;
  destination: EnvironmentId;
  quiet?: boolean;
}) {
  const { connection, update, setConnection } = useDomainConnection(destination, domain.projectId);
  const { rows, refresh } = useDomains(destination);
  const reuse = useAtomCommand(reuseCommand);
  const canConnect = useAtomValue(connectionCommand.permissionAtom(destination));
  const canReuse = useAtomValue(reuseCommand.permissionAtom(destination));
  const source = useSyncExternalStore(subscribe, () =>
    rows.find(
      (row) =>
        row.projectId !== domain.projectId &&
        connections.get(`${destination}:${row.projectId}`)?.state === "connected",
    ),
  );
  const sourceConnection = useSyncExternalStore(subscribe, () =>
    source ? connections.get(`${destination}:${source.projectId}`) : undefined,
  );
  const connected = connection?.state === "connected";
  const command = useAtomCommand(connectionCommand);
  const [chooseAccount, setChooseAccount] = useState(false);
  if (quiet)
    return (
      <>
        <DomainConnectionWarning
          hostname={domain.hostname}
          canConnect={canConnect}
          storageKey={`amicited.domain-warning.${destination}.${domain.projectId}`}
          connection={connection}
          onConnect={() => (source ? setChooseAccount(true) : void update("oauth"))}
          onCancel={() => void update("disconnect")}
          ui={{ Button }}
        />
        <Dialog open={chooseAccount} onOpenChange={setChooseAccount}>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Connect AmICited for {domain.hostname}</DialogTitle>
            </DialogHeader>
            <DialogPanel>
              {source && (
                <Button
                  onClick={() => {
                    void reuse({
                      environmentId: destination,
                      input: { projectId: domain.projectId, sourceProjectId: source.projectId },
                    }).then(async (result) => {
                      if (result._tag === "Success") {
                        setConnection(result.value);
                        await refresh();
                        setChooseAccount(false);
                      } else
                        setConnection({
                          state: "error",
                          kind: "network",
                          message: "Could not use that account. Please try connecting again.",
                        });
                    });
                  }}
                >
                  Use the same AmICited account (
                  {sourceConnection?.state === "connected"
                    ? sourceConnection.workspace
                    : "connected workspace"}
                  )
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setChooseAccount(false);
                  void update("oauth");
                }}
              >
                Connect a different account
              </Button>
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      </>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        {quiet
          ? `AmICited isn't connected for ${domain.hostname}. Free local tools still work.`
          : connected
            ? "AmICited connected"
            : connection?.state === "connecting"
              ? "Connecting…"
              : "AmICited not connected"}
      </span>
      {!connected && source && (
        <Button
          size="xs"
          variant="ghost"
          disabled={!canReuse}
          onClick={() => {
            void reuse({
              environmentId: destination,
              input: { projectId: domain.projectId, sourceProjectId: source.projectId },
            }).then(async (result) => {
              if (result._tag === "Success") {
                setConnection(result.value);
                await refresh();
              }
            });
          }}
        >
          Use the same AmICited account (
          {sourceConnection?.state === "connected"
            ? sourceConnection.workspace
            : "connected workspace"}
          )
        </Button>
      )}
      {connection && (
        <fieldset disabled={!canConnect}>
          <AmicitedConnectPanel
            connection={connection}
            connectLabel={source ? "Connect a different account" : "Connect with AmICited"}
            ui={{ Button, Input }}
            onChange={setConnection}
            openExternal={(url) => void createLocalApi().shell.openExternal(url)}
            actions={{
              connectOAuth: async () => {
                const result = await command({
                  environmentId: destination,
                  input: { projectId: domain.projectId, action: "oauth" },
                });
                if (result._tag !== "Success") throw new Error("Connection failed");
                return result.value;
              },
              connectApiKey: async (apiKey) => {
                const result = await command({
                  environmentId: destination,
                  input: { projectId: domain.projectId, action: "oauth", apiKey },
                });
                if (result._tag !== "Success") throw new Error("Connection failed");
                return result.value;
              },
              disconnect: async () => {
                const result = await command({
                  environmentId: destination,
                  input: { projectId: domain.projectId, action: "disconnect" },
                });
                if (result._tag !== "Success") throw new Error("Disconnect failed");
                return result.value;
              },
            }}
          />
        </fieldset>
      )}
      {connection?.state === "error" && <span role="alert">{connection.message}</span>}
    </div>
  );
}
export function DomainsSettings() {
  const { rows, environmentId } = useDomains();
  const projects = useProjects();
  return (
    <section>
      <h2>Domains</h2>
      <SettingsGroup>
        {rows
          .filter((domain) =>
            projects.some(
              (project) =>
                project.id === domain.projectId && project.environmentId === environmentId,
            ),
          )
          .map((domain) => (
            <SettingsRow
              key={domain.projectId}
              title={domain.hostname}
              description={domain.brand}
              control={
                environmentId ? (
                  <div>
                    <DomainProjectActions domain={domain} destination={environmentId} />
                    <DomainConnection domain={domain} destination={environmentId} />
                  </div>
                ) : null
              }
            />
          ))}
      </SettingsGroup>
    </section>
  );
}

function DomainStatusDot({ domain, destination }: { domain: Domain; destination: EnvironmentId }) {
  const { connection } = useDomainConnection(destination, domain.projectId);
  return (
    <span
      aria-label={
        connection?.state === "connected" ? "AmICited connected" : "AmICited not connected"
      }
      className={
        connection?.state === "connected"
          ? "text-success-foreground"
          : "text-sidebar-muted-foreground"
      }
    >
      ●
    </span>
  );
}

const migrations = new Map<string, Promise<void>>();
export function DomainMigration() {
  const { environmentId, refresh } = useDomains();
  const read = useAtomCommand(list);
  const create = useAtomCommand(projectEnvironment.createNew);
  const register = useAtomCommand(save);
  const migrate = useEffectEvent(async () => {
    if (!environmentId || !readBrand()) return;
    const action = async () => {
      const existing = await read({ environmentId, input: undefined });
      if (existing._tag !== "Success") throw new Error("Could not read your domains.");
      if (existing.value.length) return;
      const brand = readBrand();
      if (!brand) return;
      const domain = normalizeDomain(brand.website, brand.name);
      const created = await create({ environmentId, input: { name: domain.hostname } });
      if (created._tag !== "Success") throw new Error("Could not migrate your saved website.");
      const saved = await register({
        environmentId,
        input: {
          projectId: created.value.projectId,
          website: domain.hostname,
          brand: domain.brand,
        },
      });
      if (saved._tag !== "Success") throw new Error("Could not save your first domain.");
      localStorage.removeItem("amicited.brand");
      await refresh();
    };
    let pending = migrations.get(environmentId);
    if (!pending) {
      pending = action();
      migrations.set(environmentId, pending);
    }
    try {
      await pending;
    } catch (error) {
      migrations.delete(environmentId);
      toastManager.add({
        type: "error",
        title: error instanceof Error ? error.message : "Could not migrate your website.",
      });
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Migrate the browser's legacy website after the environment becomes available.
  useEffect(() => {
    if (environmentId) void migrate();
  }, [environmentId]);
  return null;
}

function DomainProjectActions({
  domain,
  destination,
}: {
  domain: Domain;
  destination: EnvironmentId;
}) {
  const project = useProject(scopeProjectRef(destination, ProjectId.make(domain.projectId)));
  const update = useOrchestrationCommand(projectEnvironment.update);
  const remove = useOrchestrationCommand(projectEnvironment.delete);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  if (!project) return null;
  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={`Domain actions for ${domain.hostname}`}
          render={<Button variant="ghost" size="icon-xs" />}
        >
          <MoreHorizontal />
        </MenuTrigger>
        <MenuPopup>
          <MenuItem
            onClick={() => {
              setTitle(project.title);
              setRenaming(true);
            }}
          >
            Rename domain
          </MenuItem>
          <MenuItem
            onClick={() =>
              void update({
                environmentId: destination,
                input: { projectId: project.id, archived: !project.archivedAt },
              })
            }
          >
            {project.archivedAt ? "Restore domain" : "Archive domain"}
          </MenuItem>
          <MenuItem
            variant="destructive"
            onClick={() => {
              void (async () => {
                if (
                  await createLocalApi().dialogs.confirm(
                    `Remove ${domain.hostname} and its chats? Files in its folder are kept.`,
                    { variant: "destructive", confirmLabel: "Remove domain" },
                  )
                )
                  await remove({
                    environmentId: destination,
                    input: { projectId: project.id, force: true },
                  });
              })();
            }}
          >
            Remove domain
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename domain</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void update({
                  environmentId: destination,
                  input: { projectId: project.id, title: title.trim() },
                }).then((result) => {
                  if (result._tag === "Success") setRenaming(false);
                });
              }}
            >
              <Input
                aria-label="Domain name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <Button type="submit">Save</Button>
            </form>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

export function DomainThreadGroup({
  snapshot,
  domain,
  destination,
  threads,
  onNew,
  children,
}: {
  snapshot?: SidebarProjectSnapshot | undefined;
  domain?: Domain | undefined;
  destination?: EnvironmentId | null | undefined;
  threads: readonly EnvironmentThreadShell[];
  onNew(): void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!snapshot || !domain || !destination)
    return (
      <section>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          No domain
        </Button>
        {!collapsed && children}
      </section>
    );
  return (
    <section>
      <SidebarProjectFolderHeader
        group={snapshot}
        newThreadLabel="New chat"
        actions={<DomainProjectActions domain={domain} destination={destination} />}
        collapsed={collapsed}
        hiddenThreads={threads}
        onToggle={() => setCollapsed(!collapsed)}
        onNewThread={onNew}
        onContextMenu={() => {}}
        status={<DomainStatusDot domain={domain} destination={destination} />}
      />
      {!collapsed && children}
    </section>
  );
}
