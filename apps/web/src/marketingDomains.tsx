import { desktopLocalBackendId } from "./connection/desktopLocal";
import { readPrimaryEnvironmentTarget } from "./environments/primary/target";
import { useEnvironment } from "./state/environments";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { newProjectId } from "./lib/utils";
import { cmsOptions, cmsLabel, type Cms } from "@amicited/cloud-client/domainModel";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "./components/ui/select";
import { sourceControlEnvironment } from "./state/sourceControl";
import { useProjectClone, silenceProjectCloneToasts } from "./state/projectClones";
import { useServerConfigs } from "./state/entities";
import { useSubscriptionRefresh, openCloudSubscription } from "./amicitedSubscription";
import { CloudDisclosure } from "./rpc/amicitedApprovals";
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
import {
  squashAtomCommandFailure,
  createEnvironmentRpcCommand,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { PRIMARY_LOCAL_ENVIRONMENT_ID, ProjectId, type EnvironmentId } from "@t3tools/contracts";
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
import { MoreHorizontal, FolderIcon, CodeIcon, GlobeIcon } from "lucide-react";
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
const inspect = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.inspect",
  label: "domains:inspect",
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
export { readDomain } from "./marketingDomainStore";
import { cache, listeners, empty, subscribe, publish, readFailures } from "./marketingDomainStore";
export function useDomains(destination?: EnvironmentId | null) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const read = useAtomCommand(list);
  const readFailed = useSyncExternalStore(subscribe, () =>
    Boolean(environmentId && readFailures.has(environmentId)),
  );
  const rows = useSyncExternalStore(subscribe, () =>
    environmentId ? (cache.get(environmentId) ?? empty) : empty,
  );
  const refresh = useEffectEvent(async () => {
    if (!environmentId) return;
    const result = await read({ environmentId, input: undefined });
    if (result._tag === "Success") readFailures.delete(environmentId);
    else readFailures.add(environmentId);
    listeners.forEach((listener) => listener());
    if (result._tag === "Success") publish(environmentId, result.value);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Metadata is read from the connected environment.
  useEffect(() => {
    if (environmentId) void refresh();
  }, [environmentId]);
  return { rows, environmentId, refresh, readFailed };
}
function displayFolder(path: string) {
  const homePath = path.replace(/^(?:\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/, "~");
  return homePath.length > 64 ? `${homePath.slice(0, 24)}…${homePath.slice(-36)}` : homePath;
}
export function NewDomainDialog({
  open,
  onOpenChange,
  destination,
  editing,
}: {
  editing?: Domain;
  destination?: EnvironmentId | null | undefined;
  open: boolean;
  onOpenChange(value: boolean): void;
}) {
  const { environmentId, refresh, rows: registeredDomains } = useDomains(destination);
  const projects = useProjects();
  const environment = useEnvironment(environmentId);
  const desktopBackend =
    environment && window.desktopBridge
      ? (desktopLocalBackendId(environment.entry.target) ??
        (environment.entry.target._tag === "PrimaryConnectionTarget" &&
        readPrimaryEnvironmentTarget()?.source === "desktop-managed"
          ? PRIMARY_LOCAL_ENVIRONMENT_ID
          : null))
      : null;
  const desktopFolderPicker = desktopBackend !== null;
  const create = useAtomCommand(projectEnvironment.createNew);
  const addFolder = useOrchestrationCommand(projectEnvironment.create);
  const startClone = useAtomCommand(sourceControlEnvironment.startProjectClone);
  const retryClone = useAtomCommand(sourceControlEnvironment.retryProjectClone);
  const cancelClone = useAtomCommand(sourceControlEnvironment.cancelProjectClone);
  const inspectFolder = useAtomCommand(inspect);
  const configs = useServerConfigs();
  const [cms, setCms] = useState<Cms>(editing?.cms ?? "unknown");
  const [siteFiles, setSiteFiles] = useState(editing?.siteFiles ?? "");
  const [framework, setFramework] = useState<string | null>(editing?.framework ?? null);
  const [validatedPath, setValidatedPath] = useState("");
  const [folderNote, setFolderNote] = useState("");
  const [fileChoice, setFileChoice] = useState("skip");
  const [gitUrl, setGitUrl] = useState("");
  const [cloneId, setCloneId] = useState<ProjectId | null>(null);
  const [website, setWebsite] = useState(editing?.hostname ?? "");
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingProject = useRef<{
    environmentId: EnvironmentId;
    cloneId?: ProjectId;
    projectId: ProjectId;
    root: string;
  } | null>(null);
  const liveClone = useProjectClone(
    environmentId && cloneId ? scopeProjectRef(environmentId, cloneId) : null,
  );
  const [completedClone, setCompletedClone] = useState<typeof liveClone>(null);
  const clone = liveClone ?? completedClone;
  const [savedCopies, setSavedCopies] = useState<Array<{ id: ProjectId; path: string }>>([]);
  const sourceVersion = useRef(0);
  const invalidateSource = () => {
    sourceVersion.current++;
    if (cloneId && siteFiles)
      setSavedCopies((rows) =>
        rows.some((r) => r.id === cloneId) ? rows : [...rows, { id: cloneId, path: siteFiles }],
      );
    setCloneId(null);
    setCompletedClone(null);
    pendingProject.current = null;
    setSiteFiles("");
    setValidatedPath("");
    setFramework(null);
    setFolderNote("");
    setError("");
  };
  const resetDraft = () => {
    sourceVersion.current++;
    setWebsite(editing?.hostname ?? "");
    setBrand(editing?.brand ?? "");
    setCms(editing?.cms ?? "unknown");
    setSiteFiles(editing?.siteFiles ?? "");
    setFramework(editing?.framework ?? null);
    setValidatedPath("");
    setFolderNote("");
    setFileChoice("skip");
    setGitUrl("");
    setCloneId(null);
    setCompletedClone(null);
    pendingProject.current = null;
    setError("");
  };
  const closeDialog = (value: boolean) => {
    if (busy) return;
    if (!value) {
      invalidateSource();
      resetDraft();
    }
    onOpenChange(value);
  };
  const chooseFolder = async (path: string) => {
    if (!environmentId || !path) return;
    const version = ++sourceVersion.current;
    if (pendingProject.current?.root !== path) pendingProject.current = null;
    setSiteFiles(path);
    setValidatedPath("");
    const result = await inspectFolder({ environmentId, input: { path } });
    if (version !== sourceVersion.current) return;
    if (result._tag !== "Success") {
      setError("Could not read this folder. Check the path and try again.");
      return;
    }
    setSiteFiles(path);
    setValidatedPath(path);
    setFramework(result.value.framework);
    if (result.value.framework) setCms("git");
    setFolderNote(
      `${result.value.framework ? `Detected ${result.value.framework}. ` : ""}${result.value.git ? "Git folder connected." : "This folder has no Git history. You can still use it, but version history may be unavailable."}`,
    );
    setError("");
    return true;
  };
  const retainCompletion = useEffectEvent(async () => {
    if (liveClone?.phase !== "done") return;
    const selected = await chooseFolder(siteFiles);
    if (selected) setCompletedClone(liveClone);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Persist completion of the external clone tracker before its snapshot expires.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Retaining an external completion snapshot is required after the tracker expires it.
    if (liveClone?.phase === "done") void retainCompletion();
  }, [liveClone?.phase]);
  const register = useAtomCommand(save);
  const canCreate = useAtomValue(projectEnvironment.createNew.permissionAtom(environmentId));
  const canSave = useAtomValue(save.permissionAtom(environmentId));
  const newThread = useNewThreadHandler();
  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit domain" : "New domain"}</DialogTitle>
          <DialogDescription>
            Keep this website’s chats and AmICited connection together.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !environmentId ||
                busy ||
                !canCreate ||
                !canSave ||
                (fileChoice === "folder" && (!siteFiles || validatedPath !== siteFiles)) ||
                (fileChoice === "clone" && clone?.phase !== "done")
              )
                return;
              void (async () => {
                setBusy(true);
                setError("");
                const domain = normalizeDomain(website, brand);
                const detected =
                  clone?.phase === "done" && siteFiles
                    ? await inspectFolder({ environmentId, input: { path: siteFiles } })
                    : null;
                let projectId = editing
                  ? ProjectId.make(editing.projectId)
                  : pendingProject.current?.environmentId === environmentId &&
                      pendingProject.current.cloneId === (cloneId ?? undefined)
                    ? pendingProject.current.projectId
                    : undefined;
                if (!projectId) {
                  const candidateId = newProjectId();
                  const created = siteFiles
                    ? await addFolder({
                        environmentId,
                        input: {
                          projectId: candidateId,
                          title: domain.hostname,
                          workspaceRoot: siteFiles,
                        },
                      })
                    : await create({ environmentId, input: { name: domain.hostname } });
                  if (created._tag !== "Success") {
                    setError("Could not create this domain. Please try again.");
                    return;
                  }
                  projectId = siteFiles
                    ? candidateId
                    : (created.value as { projectId: ProjectId }).projectId;
                  pendingProject.current = { environmentId, projectId, root: siteFiles };
                }
                const result = await register({
                  environmentId,
                  input: {
                    projectId,
                    website: domain.hostname,
                    brand: domain.brand,
                    cms: detected?._tag === "Success" && detected.value.framework ? "git" : cms,
                    siteFiles: siteFiles || null,
                    framework: detected?._tag === "Success" ? detected.value.framework : framework,
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
                setSavedCopies((rows) => rows.filter((r) => r.id !== projectId));
                resetDraft();
                if (!editing) await newThread(scopeProjectRef(environmentId, projectId));
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
                disabled={busy}
                autoFocus
                value={website}
                onChange={(event) => {
                  if (!editing) invalidateSource();
                  setWebsite(event.target.value);
                }}
                placeholder="example.com"
              />
            </label>
            <label>
              Brand name (optional)
              <Input value={brand} onChange={(event) => setBrand(event.target.value)} />
            </label>
            <label>
              CMS
              <Select
                disabled={busy}
                value={cms}
                onValueChange={(value) => {
                  if (value) {
                    setCms(value);
                    if (!editing && !["git", "headless", "unknown"].includes(value)) {
                      invalidateSource();
                      setFileChoice("skip");
                    }
                  }
                }}
              >
                <SelectTrigger aria-label="CMS">
                  <SelectValue>
                    {() => (cms === "unknown" ? "Not sure" : cmsLabel(cms))}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {cmsOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
            {editing ? (
              <p className="text-sm text-muted-foreground">
                {editing.siteFiles ? `Folder: ${editing.siteFiles}` : "Site files: Not connected"}.
                Existing chats keep their original folder. To connect different site files, create a
                new domain from that folder.
              </p>
            ) : (
              ["git", "headless", "unknown"].includes(cms) && (
                <fieldset className="flex min-w-0 max-w-full flex-col gap-2 [&>*]:min-w-0 [&>*]:max-w-full">
                  <legend>Site files</legend>
                  <Select
                    disabled={busy}
                    value={fileChoice}
                    onValueChange={(value) => {
                      if (value) {
                        invalidateSource();
                        setFileChoice(value);
                      }
                    }}
                  >
                    <SelectTrigger aria-label="Site files">
                      <SelectValue>
                        {() =>
                          fileChoice === "skip"
                            ? "Skip for now"
                            : fileChoice === "folder"
                              ? "Use a folder on this computer"
                              : "Clone from a Git URL"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="skip">Skip for now</SelectItem>
                      <SelectItem value="folder">Use a folder on this computer</SelectItem>
                      <SelectItem value="clone">Clone from a Git URL</SelectItem>
                    </SelectPopup>
                  </Select>
                  {fileChoice === "folder" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void createLocalApi()
                            .dialogs.pickFolder(
                              desktopBackend !== null
                                ? { targetEnvironmentId: desktopBackend }
                                : undefined,
                            )
                            .then((path) => {
                              if (path) return chooseFolder(path);
                            })
                            .catch(() => setError("Could not open the folder picker."));
                        }}
                      >
                        {siteFiles ? "Change folder" : "Choose folder"}
                      </Button>
                      {siteFiles && (
                        <p className="truncate text-sm text-muted-foreground">
                          {siteFiles.split(/[\\/]/).pop()}
                        </p>
                      )}
                      {!desktopFolderPicker && !validatedPath && (
                        <Input
                          disabled={busy}
                          aria-label="Folder path"
                          placeholder="/Users/you/Sites/acme"
                          value={siteFiles}
                          onChange={(event) => {
                            sourceVersion.current++;
                            if (pendingProject.current?.root !== event.target.value)
                              pendingProject.current = null;
                            setValidatedPath("");
                            setSiteFiles(event.target.value);
                            setFramework(null);
                            setFolderNote("");
                          }}
                          onBlur={() => {
                            void chooseFolder(siteFiles);
                          }}
                        />
                      )}
                    </>
                  )}
                  {fileChoice === "clone" && (
                    <>
                      <Input
                        disabled={busy || clone?.phase === "running"}
                        aria-label="Git URL"
                        placeholder="https://github.com/team/site.git"
                        value={gitUrl}
                        onChange={(event) => {
                          invalidateSource();
                          setGitUrl(event.target.value);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!!cloneId || !gitUrl.trim()}
                        onClick={() => {
                          if (!environmentId) return;
                          const root = configs.get(environmentId)?.newProjectsRoot;
                          if (!root) {
                            setError(
                              "The folder for new sites is unavailable. Try again after reconnecting.",
                            );
                            return;
                          }
                          let hostname: string;
                          try {
                            hostname = normalizeDomain(website).hostname;
                          } catch {
                            setError("Enter a website like example.com before copying site files.");
                            return;
                          }
                          const roots = new Set(
                            projects
                              .filter((p) => p.environmentId === environmentId)
                              .map((p) => p.workspaceRoot),
                          );
                          let destinationPath = `${root}/${hostname}`;
                          for (let suffix = 2; roots.has(destinationPath); suffix++)
                            destinationPath = `${root}/${hostname}-${suffix}`;
                          const projectId = newProjectId();
                          silenceProjectCloneToasts(scopeProjectRef(environmentId, projectId));
                          setBusy(true);
                          void startClone({
                            environmentId,
                            input: {
                              projectId,
                              title: hostname,
                              remoteUrl: gitUrl.trim(),
                              destinationPath,
                              createdAt: new Date().toISOString(),
                            },
                          })
                            .then((result) => {
                              if (result._tag !== "Success") {
                                setError(
                                  /destination.*exists/i.test(
                                    String(squashAtomCommandFailure(result)),
                                  )
                                    ? "A folder for this website already exists. Choose that folder, or use a different website name."
                                    : "Could not copy the site. Check the Git URL and your access, then try again.",
                                );
                                return;
                              }
                              setCloneId(projectId);
                              setSiteFiles(result.value.cwd);
                              pendingProject.current = {
                                environmentId,
                                cloneId: projectId,
                                projectId,
                                root: result.value.cwd,
                              };
                            })
                            .catch(() =>
                              setError("Could not copy the site. Check the website and Git URL."),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        Clone site files
                      </Button>
                      {clone && clone.phase === "running" && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            if (environmentId && cloneId)
                              void cancelClone({ environmentId, input: { projectId: cloneId } });
                          }}
                        >
                          Cancel copy
                        </Button>
                      )}
                      {clone && (clone.phase === "failed" || clone.phase === "cancelled") && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (environmentId && cloneId)
                              void retryClone({ environmentId, input: { projectId: cloneId } });
                          }}
                        >
                          Try copying again
                        </Button>
                      )}
                      {clone?.error && (
                        <details>
                          <summary>More</summary>
                          <pre className="whitespace-pre-wrap text-xs">{clone.error}</pre>
                        </details>
                      )}
                      {clone && (
                        <p role="status" className="truncate text-sm text-muted-foreground">
                          {clone.phase === "running"
                            ? `Copying site files… ${clone.percent ?? 0}%`
                            : clone.phase === "done"
                              ? `Copied to ${displayFolder(siteFiles)}`
                              : /destination.*exists/i.test(clone.error ?? "")
                                ? "A folder for this website already exists. Choose that folder, or use a different website name."
                                : "Could not copy the site. Check the Git URL and your access, then retry."}
                        </p>
                      )}
                    </>
                  )}
                  {folderNote && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {folderNote}
                    </p>
                  )}
                  {siteFiles && (
                    <p className="text-sm text-muted-foreground">
                      Changes stay in this folder. Nothing is published or pushed for you.
                    </p>
                  )}
                </fieldset>
              )
            )}
            {savedCopies.some(
              (copy) => !registeredDomains.some((d) => d.projectId === copy.id),
            ) && (
              <details className="min-w-0 max-w-full">
                <summary>Reuse previously copied site files</summary>
                {savedCopies
                  .filter((copy) => !registeredDomains.some((d) => d.projectId === copy.id))
                  .map((copy) => (
                    <div key={copy.id} className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{displayFolder(copy.path)}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          invalidateSource();
                          setFileChoice("folder");
                          if (environmentId)
                            pendingProject.current = {
                              environmentId,
                              projectId: copy.id,
                              root: copy.path,
                            };
                          void chooseFolder(copy.path);
                        }}
                      >
                        Use this copy
                      </Button>
                    </div>
                  ))}
              </details>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !canCreate ||
                  !canSave ||
                  (fileChoice !== "skip" && !siteFiles) ||
                  (fileChoice === "folder" && validatedPath !== siteFiles) ||
                  (!!cloneId && clone?.phase !== "done")
                }
              >
                {busy ? "Saving…" : editing ? "Save domain" : "Create domain"}
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
  useSubscriptionRefresh(destination, domain.projectId, setConnection);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
                  variant="outline"
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
                  Use the account connected to {source.hostname}
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
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={
              connected
                ? "size-1.5 rounded-full bg-success-foreground"
                : "size-1.5 rounded-full bg-muted-foreground"
            }
          />
          {connected
            ? "Connected"
            : connection?.state === "connecting"
              ? "Connecting…"
              : "Not connected"}
        </span>
        {connected ? (
          <Button
            size="xs"
            variant="outline"
            disabled={!canConnect}
            onClick={() => void update("disconnect")}
          >
            Disconnect
          </Button>
        ) : source ? (
          <Button
            size="xs"
            variant="outline"
            disabled={!canReuse}
            onClick={() => {
              void reuse({
                environmentId: destination,
                input: { projectId: domain.projectId, sourceProjectId: source.projectId },
              }).then(async (result) => {
                if (result._tag === "Success") {
                  setConnection(result.value);
                  await refresh();
                } else
                  setConnection({
                    state: "error",
                    kind: "network",
                    message: "Could not use that account. Please try again.",
                  });
              });
            }}
          >
            Use the account connected to {source.hostname}
          </Button>
        ) : (
          <Button size="xs" disabled={!canConnect} onClick={() => setDetailsOpen(true)}>
            Connect
          </Button>
        )}
        <Button size="xs" variant="outline" onClick={() => setDetailsOpen(true)}>
          Connection details
        </Button>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>AmICited for {domain.hostname}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {connection && (
              <fieldset disabled={!canConnect}>
                <AmicitedConnectPanel
                  connection={connection}
                  connectLabel={source ? "Connect a different account" : "Connect with AmICited"}
                  ui={{
                    Button,
                    Input,
                    Row: SettingsRow,
                    Group: SettingsGroup,
                    Disclosure: CloudDisclosure,
                  }}
                  onChange={setConnection}
                  openExternal={(url) => {
                    if (url === "https://app.flowhunt.io/amicited/subscription")
                      openCloudSubscription(destination, domain.projectId);
                    else void createLocalApi().shell.openExternal(url);
                  }}
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
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

export function DomainsSettings() {
  const { rows, environmentId, readFailed } = useDomains();
  const projects = useProjects();
  return (
    <section>
      <h2>Domains</h2>
      {readFailed && (
        <p role="status" className="text-sm text-muted-foreground">
          Couldn't read your domains. Edits in site folders may not ask first.
        </p>
      )}
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
              description={
                <span className="block min-w-0">
                  <span>
                    {[
                      domain.brand,
                      domain.framework ?? (domain.cms !== "unknown" ? cmsLabel(domain.cms) : ""),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<span className="block truncate" />}>
                      {domain.siteFiles
                        ? `Folder: ${displayFolder(domain.siteFiles)}`
                        : "Site files: Not connected"}
                    </TooltipTrigger>
                    <TooltipPopup>{domain.siteFiles ?? "Site files: Not connected"}</TooltipPopup>
                  </Tooltip>
                </span>
              }
              control={
                environmentId ? (
                  <div className="flex items-center gap-2">
                    <DomainConnection domain={domain} destination={environmentId} />
                    <DomainProjectActions domain={domain} destination={environmentId} />
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
          ? "size-1.5 rounded-full bg-success-foreground"
          : "size-1.5 rounded-full bg-sidebar-muted-foreground"
      }
    />
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
      const retryKey = `amicited.domain-migration.${environmentId}.${domain.hostname}`;
      let projectId = localStorage.getItem(retryKey);
      if (!projectId) {
        const created = await create({ environmentId, input: { name: domain.hostname } });
        if (created._tag !== "Success") throw new Error("Could not migrate your saved website.");
        projectId = created.value.projectId;
        localStorage.setItem(retryKey, projectId);
      }
      const saved = await register({
        environmentId,
        input: {
          projectId,
          website: domain.hostname,
          brand: domain.brand,
        },
      });
      if (saved._tag !== "Success") throw new Error("Could not save your first domain.");
      localStorage.removeItem(retryKey);
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
  const [editing, setEditing] = useState(false);
  const [newFromFolder, setNewFromFolder] = useState(false);
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
          <MenuItem onClick={() => setEditing(true)}>Edit domain</MenuItem>
          <MenuItem onClick={() => setNewFromFolder(true)}>
            Create a new domain from this folder
          </MenuItem>
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
      {editing && (
        <NewDomainDialog
          open
          onOpenChange={setEditing}
          destination={destination}
          editing={domain}
        />
      )}
      <NewDomainDialog
        open={newFromFolder}
        onOpenChange={setNewFromFolder}
        destination={destination}
      />
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
        status={
          <span className="flex shrink-0 items-center gap-1 text-xs text-sidebar-muted-foreground">
            <DomainStatusDot domain={domain} destination={destination} />
            {domain.cms && domain.cms !== "unknown" && (
              <Tooltip>
                <TooltipTrigger
                  render={<span role="img" aria-label={domain.framework ?? cmsLabel(domain.cms)} />}
                >
                  {domain.cms === "git" ? (
                    <CodeIcon className="size-3" />
                  ) : (
                    <GlobeIcon className="size-3" />
                  )}
                </TooltipTrigger>
                <TooltipPopup>{domain.framework ?? cmsLabel(domain.cms)}</TooltipPopup>
              </Tooltip>
            )}
            {domain.siteFiles && (
              <Tooltip>
                <TooltipTrigger
                  render={<span role="img" aria-label={`Folder: ${domain.siteFiles}`} />}
                >
                  <FolderIcon className="size-3" />
                </TooltipTrigger>
                <TooltipPopup>Folder: {domain.siteFiles}</TooltipPopup>
              </Tooltip>
            )}
          </span>
        }
      />
      {!collapsed && children}
    </section>
  );
}
