/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles own these classes. */
import { TrackingVisibility } from "./amicited/amicitedTracking";
import { findReportKeySource } from "./marketingReports.logic";
import { CmsGrid } from "@amicited/ui-marketing";
import { desktopLocalBackendId } from "./connection/desktopLocal";
import { readPrimaryEnvironmentTarget } from "./environments/primary/target";
import { useEnvironment } from "./state/environments";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { newProjectId } from "./lib/utils";
import { cmsLabel, type Cms } from "@amicited/cloud-client/domainModel";
import { sourceControlEnvironment } from "./state/sourceControl";
import { useProjectClone, silenceProjectCloneToasts } from "./state/projectClones";
import { useServerConfigs } from "./state/entities";
import { useSubscriptionRefresh, openCloudSubscription } from "./amicitedSubscription";
import { CloudDisclosure } from "./rpc/amicitedApprovals";
import { useAtomValue } from "@effect/atom-react";
import { SidebarProjectFolderHeader } from "./components/sidebar/SidebarProjectFolderHeader";
import { DomainConnectionWarning, AmicitedConnectPanel } from "@amicited/ui-cloud";
import { useEffect, useId, useRef, useEffectEvent, useState, useSyncExternalStore } from "react";
import type { Domain } from "@amicited/cloud-client/domains";
import { guessBrandName, normalizeDomain } from "@amicited/cloud-client/domainModel";
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
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { FolderOpen, GitBranch, MoreHorizontal, SkipForward } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
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
import { SettingsScopeProvider } from "./components/settings/SettingsScopeContext";
import { ProjectDefaultsSettings } from "./components/settings/ProjectDefaultsSettings";
import { useSettingsProjectGroups } from "./components/settings/useSettingsProjectGroups";
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
  const environment = useEnvironment(environmentId);
  const phase = environment?.connection.phase;
  const readFailed = useSyncExternalStore(subscribe, () =>
    Boolean(environmentId && readFailures.has(environmentId)),
  );
  const loaded = useSyncExternalStore(subscribe, () =>
    Boolean(environmentId && cache.has(environmentId)),
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
    if (environmentId && phase === "connected") void refresh();
  }, [environmentId, phase]);
  return {
    rows,
    environmentId,
    refresh,
    readFailed,
    loaded,
  };
}
const siteFileChoices = [
  {
    id: "skip",
    title: "Skip for now",
    detail: "Chat about your site without its code",
    Icon: SkipForward,
  },
  {
    id: "folder",
    title: "Folder on this computer",
    detail: "Use a copy you already have",
    Icon: FolderOpen,
  },
  { id: "clone", title: "Clone from Git", detail: "Download it from a Git URL", Icon: GitBranch },
] as const;

function displayFolder(path: string) {
  const homePath = path.replace(/^(?:\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/, "~");
  return homePath.length > 64 ? `${homePath.slice(0, 24)}…${homePath.slice(-36)}` : homePath;
}
export function NewDomainDialog({
  open,
  onOpenChange,
  destination,
  editing,
  onCreated,
  inline = false,
  initialWebsite = "",
  cloudDomain,
  onReadyChange,
}: {
  onReadyChange?: (ready: boolean) => void;
  inline?: boolean;
  initialWebsite?: string;
  cloudDomain?: { domainId?: string; brand?: string } | undefined;
  onCreated?: (projectId: string) => void;
  editing?: Domain;
  destination?: EnvironmentId | null | undefined;
  open: boolean;
  onOpenChange(value: boolean): void;
}) {
  const { environmentId, refresh, rows: registeredDomains, loaded } = useDomains(destination);
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
  const websiteId = useId();
  const brandId = useId();
  const siteFilesId = useId();
  const [framework, setFramework] = useState<string | null>(editing?.framework ?? null);
  const [validatedPath, setValidatedPath] = useState("");
  const [folderNote, setFolderNote] = useState("");
  const [fileChoice, setFileChoice] = useState("skip");
  const [gitUrl, setGitUrl] = useState("");
  const [cloneId, setCloneId] = useState<ProjectId | null>(null);
  const [website, setWebsite] = useState(editing?.hostname ?? initialWebsite);
  const [brandEdited, setBrandEdited] = useState(Boolean(editing));
  const [brand, setBrand] = useState(editing?.brand ?? cloudDomain?.brand ?? "");
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
    setBrandEdited(Boolean(editing));
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
  let existingDomain: Domain | undefined;
  let websiteValid = false;
  try {
    const hostname = normalizeDomain(website).hostname;
    websiteValid = true;
    existingDomain = registeredDomains.find(
      (row) => row.hostname === hostname && row.projectId !== editing?.projectId,
    );
  } catch {
    // Incomplete website input has no matching domain yet.
  }
  const ready =
    websiteValid &&
    !existingDomain &&
    !busy &&
    canCreate &&
    canSave &&
    !(fileChoice !== "skip" && !siteFiles) &&
    !(fileChoice === "folder" && validatedPath !== siteFiles) &&
    !(fileChoice === "clone" && clone?.phase !== "done") &&
    !(!!cloneId && clone?.phase !== "done");
  const reportReady = useEffectEvent((value: boolean) => onReadyChange?.(value));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The setup footer's Continue button lives outside this form and must follow its validity.
  useEffect(() => {
    reportReady(ready);
  }, [ready]);
  const openExisting = async (domain: Domain) => {
    if (!environmentId) return;
    onOpenChange(false);
    resetDraft();
    if (onCreated) onCreated(domain.projectId);
    else await newThread(scopeProjectRef(environmentId, ProjectId.make(domain.projectId)));
  };
  const form = (
    <form
      id={inline ? "amicited-onboarding-domain" : undefined}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !environmentId ||
          !loaded ||
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
          if (existingDomain) {
            await openExisting(existingDomain);
            return;
          }
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
              ...(cloudDomain?.domainId ? { domainId: cloudDomain.domainId } : {}),
              cms: detected?._tag === "Success" && detected.value.framework ? "git" : cms,
              siteFiles: siteFiles || null,
              framework: detected?._tag === "Success" ? detected.value.framework : framework,
            },
          });
          if (result._tag !== "Success") {
            const failure = Option.getOrNull(Cause.findErrorOption(result.cause));
            setError(
              failure && "message" in failure && failure.message.startsWith("Could not add")
                ? failure.message
                : "The folder was created, but its domain could not be saved. Please try again.",
            );
            return;
          }
          pendingProject.current = null;
          await refresh();
          onOpenChange(false);
          setSavedCopies((rows) => rows.filter((r) => r.id !== projectId));
          resetDraft();
          if (onCreated) onCreated(projectId);
          else if (!editing) await newThread(scopeProjectRef(environmentId, projectId));
        })()
          .catch((error) =>
            setError(error instanceof Error ? error.message : "Could not create this domain."),
          )
          .then(() => setBusy(false));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={websiteId}>Website</Label>
        <Input
          id={websiteId}
          required
          disabled={busy}
          autoFocus
          value={website}
          onChange={(event) => {
            if (!editing) invalidateSource();
            setWebsite(event.target.value);
            if (!brandEdited) setBrand(guessBrandName(event.target.value));
          }}
          placeholder="example.com"
        />
      </div>
      {existingDomain ? (
        <p role="status" className="text-sm text-muted-foreground">
          <span>{existingDomain.hostname} is already added.</span>{" "}
          <Button
            variant="link"
            disabled={busy}
            onClick={() => {
              if (existingDomain) void openExisting(existingDomain);
            }}
          >
            Open it
          </Button>
        </p>
      ) : (
        <DomainHint website={website} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={brandId}>Brand name (optional)</Label>
        <Input
          id={brandId}
          value={brand}
          onChange={(event) => {
            setBrandEdited(true);
            setBrand(event.target.value);
          }}
        />
      </div>
      <CmsGrid
        value={cms}
        disabled={busy}
        onChange={(value) => {
          setCms(value);
          if (!editing && !["git", "headless", "unknown"].includes(value)) {
            invalidateSource();
            setFileChoice("skip");
          }
        }}
      />
      {editing ? (
        <p className="text-sm text-muted-foreground">
          {editing.siteFiles ? `Folder: ${editing.siteFiles}` : "Site files: Not connected"}.
          Existing chats keep their original folder. To connect different site files, create a new
          domain from that folder.
        </p>
      ) : (
        ["git", "headless", "unknown"].includes(cms) && (
          <fieldset className="flex min-w-0 max-w-full flex-col gap-2 [&>*]:min-w-0 [&>*]:max-w-full">
            <Label render={<legend />}>Site files</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional. With your site&apos;s code, the assistant can read and edit pages directly.
            </p>
            <div className="am-source-grid" role="radiogroup" aria-label="Site files">
              {siteFileChoices.map(({ id, title, detail, Icon }) => (
                <label key={id} className="am-cms-tile">
                  <input
                    type="radio"
                    name="site-files"
                    value={id}
                    checked={fileChoice === id}
                    disabled={busy}
                    aria-labelledby={`${siteFilesId}-${id}`}
                    aria-describedby={`${siteFilesId}-${id}-detail`}
                    onChange={() => {
                      invalidateSource();
                      setFileChoice(id);
                    }}
                  />
                  <Icon aria-hidden="true" className="size-5" />
                  <span id={`${siteFilesId}-${id}`}>{title}</span>
                  <small id={`${siteFilesId}-${id}-detail`}>{detail}</small>
                </label>
              ))}
            </div>
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
                            /destination.*exists/i.test(String(squashAtomCommandFailure(result)))
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
                Agents can edit files in this folder. Nothing is published or pushed for you. Review
                changes in the chat.
              </p>
            )}
          </fieldset>
        )
      )}
      {savedCopies.some((copy) => !registeredDomains.some((d) => d.projectId === copy.id)) && (
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
      {editing && environmentId && (
        <DomainChatDefaults
          projectId={editing.projectId}
          environmentId={environmentId}
          hasSiteFolder={!!editing.siteFiles}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <div className={inline ? "hidden" : "flex justify-end gap-2"}>
        <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          {busy ? "Saving…" : editing ? "Save domain" : "Create domain"}
        </Button>
      </div>
    </form>
  );
  return inline ? (
    form
  ) : (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit domain" : "New domain"}</DialogTitle>
          <DialogDescription>
            Keep this website’s chats and AmICited connection together.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>{form}</DialogPanel>
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
export type DomainLink = "linked" | "locked" | "unknown";
// A failing request still has an account behind it; only a missing or rejected sign-in locks a domain.
function domainLink(connection: Connection | undefined): DomainLink {
  if (!connection) return "unknown";
  if (connection.state === "connected") return "linked";
  return connection.state === "error" && connection.kind !== "auth" ? "linked" : "locked";
}
/** Whether each domain has an AmICited account behind it, for views that span domains. */
export function useDomainLinks(
  destination: EnvironmentId | null | undefined,
  projectIds: ReadonlyArray<string>,
): ReadonlyMap<string, DomainLink> {
  const read = useAtomCommand(statusCommand);
  const ids = projectIds.join("\n");
  const links = useSyncExternalStore(subscribe, () =>
    projectIds.map((id) => domainLink(connections.get(`${destination}:${id}`))).join(","),
  ).split(",");
  const refresh = useEffectEvent((destination: EnvironmentId) => {
    for (const projectId of projectIds)
      void read({ environmentId: destination, input: { projectId } }).then((result) => {
        connections.set(
          `${destination}:${projectId}`,
          result._tag === "Success"
            ? result.value
            : {
                state: "error",
                kind: "network",
                message: "Could not read this domain’s AmICited connection.",
              },
        );
        listeners.forEach((listener) => listener());
      });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Connection state lives in the destination server's keyring.
  useEffect(() => {
    if (destination && ids) refresh(destination);
  }, [destination, ids]);
  return new Map(
    projectIds.map((id, index) => {
      const link = links[index];
      return [id, link === "linked" || link === "locked" ? link : "unknown"];
    }),
  );
}
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
  onboarding = false,
  reports = false,
}: {
  onboarding?: boolean;
  reports?: boolean;
  domain: Domain;
  destination: EnvironmentId;
  quiet?: boolean;
}) {
  const { connection, update, setConnection } = useDomainConnection(destination, domain.projectId);
  const { rows, refresh } = useDomains(destination);
  const reuse = useAtomCommand(reuseCommand);
  const canConnect = useAtomValue(connectionCommand.permissionAtom(destination));
  const canReuse = useAtomValue(reuseCommand.permissionAtom(destination));
  const readConnection = useAtomCommand(statusCommand);
  const readReuseSources = useEffectEvent(
    (domains: readonly Domain[], environmentId: EnvironmentId) => {
      void Promise.all(
        domains
          .filter((row) => row.projectId !== domain.projectId)
          .map(async (row) => {
            const result = await readConnection({
              environmentId,
              input: { projectId: row.projectId },
            });
            if (result._tag === "Success")
              connections.set(`${environmentId}:${row.projectId}`, result.value);
          }),
      ).then(() => listeners.forEach((listener) => listener()));
    },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read other domains' server connection status so key reuse works on a fresh Reports visit.
  useEffect(() => {
    if (reports) readReuseSources(rows, destination);
  }, [reports, destination, rows]);
  const source = useSyncExternalStore(subscribe, () =>
    reports
      ? findReportKeySource(rows, domain.projectId, (projectId) =>
          connections.get(`${destination}:${projectId}`),
        )
      : rows.find(
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
  if (domain.workspaceId) {
    const tracked = domain.domainId ? "In AmICited" : "Not in AmICited yet";
    if (quiet) return domain.domainId ? null : <span>{tracked}</span>;
    return <span>{tracked} · connected through your workspace</span>;
  }
  const connectionPanel = connection && (
    <fieldset disabled={!canConnect}>
      <AmicitedConnectPanel
        connection={connection}
        apiKeyOnly={reports}
        inline={onboarding}
        connectLabel={source ? "Connect a different account" : "Connect AmICited (free)"}
        ui={{
          Button,
          Input,
          Row: SettingsRow,
          ...(onboarding ? {} : { Group: SettingsGroup }),
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
  );
  if (reports)
    return (
      <div className="flex flex-col gap-3">
        {source && (
          <Button
            variant="outline"
            disabled={!canReuse}
            onClick={() => {
              void reuse({
                environmentId: destination,
                input: { projectId: domain.projectId, sourceProjectId: source.projectId },
              }).then((result) => {
                if (result._tag === "Success") setConnection(result.value);
              });
            }}
          >
            Use the key connected to {source.hostname}
          </Button>
        )}
        {connectionPanel}
      </div>
    );
  if (onboarding) return connectionPanel;
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
          <DialogPanel>{connectionPanel}</DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

// Reuses T3's project-scoped "New threads" defaults; these rows save as soon as they change.
function DomainChatDefaults({
  projectId,
  environmentId,
  hasSiteFolder,
}: {
  projectId: string;
  environmentId: EnvironmentId;
  hasSiteFolder: boolean;
}) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) =>
    candidate.memberProjects.some(
      (member) => member.id === projectId && member.environmentId === environmentId,
    ),
  );
  if (!group) return null;
  return (
    <SettingsScopeProvider
      search={{ project: group.projectKey, machine: environmentId }}
      onChange={() => {}}
    >
      <ProjectDefaultsSettings category="project" showWorkspace={hasSiteFolder} />
    </SettingsScopeProvider>
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
          Couldn't read your domains. Try again to load their details.
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
  if (!readBrand()) return null;
  return (
    <section>
      <p>We found a website from an older version on this computer.</p>
      <Button onClick={() => void migrate()}>Add to AmICited</Button>
    </section>
  );
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

export function DomainFolderHeader({
  domain,
  destination,
  ...props
}: React.ComponentProps<typeof SidebarProjectFolderHeader> & {
  domain: Domain;
  destination: EnvironmentId;
}) {
  return (
    <SidebarProjectFolderHeader
      {...props}
      group={{ ...props.group, displayName: domain.hostname }}
      newThreadLabel="New chat"
      keepChevron
      actions={
        <>
          <TrackingVisibility domain={domain} destination={destination} />
          <DomainProjectActions domain={domain} destination={destination} />
        </>
      }
    />
  );
}

function DomainHint({ website }: { website: string }) {
  let hostname = "";
  try {
    hostname = normalizeDomain(website).hostname;
  } catch {
    /* Incomplete input. */
  }
  return hostname ? (
    <p role="status" className="text-xs text-muted-foreground">
      Detected · {hostname}
    </p>
  ) : null;
}
