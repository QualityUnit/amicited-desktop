import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId } from "@t3tools/contracts";
import { revealReportPreview } from "./reportEditing";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useEffectEvent, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Atom, AsyncResult } from "effect/reactivity";
import type {
  Report,
  ReportSummary,
  ReportSnapshotSummary,
  ReportTemplate,
} from "@amicited/reports/rpc";
import type { EnvironmentId } from "@t3tools/contracts";
import type { Domain } from "@amicited/cloud-client/domains";
import { DOCS_URL } from "@amicited/cloud-client/model";
import { ReportPage, ReportViewer, groupReports } from "@amicited/ui-marketing";
import { canUseReportConnection } from "./marketingReports.logic";
import { reports, reportChanges, reportChangesForReport } from "./rpc/amicitedReports";
import { useAtomCommand } from "./state/use-atom-command";
import {
  useDomains,
  useDomainConnection,
  DomainConnection,
  NewDomainDialog,
} from "./marketingDomains";
import { useEnvironment, usePrimaryEnvironmentId } from "./state/environments";
import { createLocalApi } from "./localApi";
import { usePreparedConnection } from "./state/session";
import { toastManager } from "./components/ui/toast";
import { Textarea } from "./components/ui/textarea";
import {
  fetchReportResource,
  downloadReportBlob,
  type ReportFormat,
  type ReportLinkTarget,
} from "./reportResources";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from "./components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "./components/ui/select";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./components/ui/menu";

const noChange = Atom.make(AsyncResult.initial());
function useReportChanges(environmentId: EnvironmentId | null | undefined) {
  return useAtomValue(
    environmentId ? reportChanges({ environmentId, input: undefined }) : noChange,
  );
}
const date = (value: string) => new Date(value).toLocaleString();
function ReportDocument({
  environmentId,
  reportId,
  snapshot,
}: {
  environmentId: EnvironmentId;
  reportId: string;
  snapshot: ReportSnapshotSummary | undefined;
}) {
  const mint = useAtomCommand(reports.links);
  const connection = usePreparedConnection(environmentId);
  const origin = connection._tag === "Some" ? connection.value.httpBaseUrl : null;
  const change = useAtomValue(reportChangesForReport(JSON.stringify([environmentId, reportId])));
  const snapshotId = snapshot?.id;
  const narrative = snapshot?.narrative;
  const [retry, setRetry] = useState(0);
  const [document, setDocument] = useState<{ src?: string; error?: string }>({});
  const load = useEffectEvent(
    (
      target: ReportLinkTarget,
      format: ReportFormat,
      origin: string,
      signal: AbortSignal,
      _change: unknown,
      _retry: number,
      _narrative: ReportSnapshotSummary["narrative"] | undefined,
    ) =>
      fetchReportResource(
        async (input) => {
          const result = await mint({ environmentId, input });
          if (result._tag !== "Success") {
            const failure = squashAtomCommandFailure(result);
            throw new Error(
              failure instanceof Error
                ? failure.message
                : "Could not prepare report links. Reconnect and try again.",
            );
          }
          return result.value;
        },
        target,
        format,
        origin,
        signal,
      ),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fetch signed HTML from the destination environment and release its object URL on replacement.
  useEffect(() => {
    if (!origin) return;
    const controller = new AbortController();
    let url: string | undefined;
    let mintedAt = 0;
    const refresh = () => {
      mintedAt = Date.now();
      void load(
        snapshotId ? { snapshotId } : { reportId },
        snapshotId ? "html" : "preview",
        origin,
        controller.signal,
        change,
        retry,
        narrative,
      )
        .then((blob) => {
          if (controller.signal.aborted) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          setDocument({ src: url });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setDocument({
              error: error instanceof Error ? error.message : "Could not load report.",
            });
        });
    };
    const resume = () => {
      if (Date.now() - mintedAt >= 5 * 60_000) refresh();
    };
    refresh();
    window.addEventListener("focus", resume);
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      window.removeEventListener("focus", resume);
    };
  }, [origin, reportId, snapshotId, narrative, change, retry]);
  if (document.error)
    return (
      <p role="alert">
        {document.error}{" "}
        <Button variant="outline" onClick={() => setRetry(retry + 1)}>
          Retry
        </Button>
      </p>
    );
  return document.src ? (
    <ReportViewer src={document.src} preview={!snapshot} />
  ) : (
    <p role="status">Loading report…</p>
  );
}
function DomainChoice({
  domains,
  value,
  onChange,
}: {
  domains: readonly Domain[];
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm" htmlFor="report-domain">
        Domain
      </label>
      <Select
        value={value}
        onValueChange={(value) => {
          if (value) onChange(value);
        }}
      >
        <SelectTrigger id="report-domain" aria-label="Domain">
          <SelectValue placeholder="Choose domain">
            {domains.find((domain) => domain.projectId === value)?.hostname ?? "Choose domain"}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {domains.map((domain) => (
            <SelectItem key={domain.projectId} value={domain.projectId}>
              {domain.hostname}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}
function ConnectionGate({
  domain,
  environmentId,
}: {
  domain: Domain;
  environmentId: EnvironmentId;
}) {
  const { connection } = useDomainConnection(environmentId, domain.projectId);
  if (!connection) return <p role="status">Checking AmICited connection…</p>;
  if (canUseReportConnection(connection)) return null;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">Reports need an AmICited API key</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void createLocalApi().shell.openExternal(DOCS_URL)}
        >
          Create API key
        </Button>
      </div>
      <DomainConnection domain={domain} destination={environmentId} reports />
    </section>
  );
}
function useSnapshots(environmentId: EnvironmentId, reportId: string) {
  const read = useAtomCommand(reports.snapshots);
  const change = useAtomValue(reportChangesForReport(JSON.stringify([environmentId, reportId])));
  const environment = useEnvironment(environmentId);
  const [snapshots, setSnapshots] = useState<readonly ReportSnapshotSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const refresh = useEffectEvent((destination = environmentId, id = reportId, _change = change) =>
    read({ environmentId: destination, input: { reportId: id } }).then((result) => {
      setFailed(result._tag !== "Success");
      setLoaded(true);
      if (result._tag === "Success")
        setSnapshots(result.value.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read saved snapshots when the server connects or publishes a report change.
  useEffect(() => {
    if (environment?.connection.phase === "connected")
      void refresh(environmentId, reportId, change);
  }, [environment?.connection.phase, environmentId, reportId, change]);
  return { snapshots, loaded, failed, refresh };
}
function SnapshotCommentary({ state }: { state: ReportSnapshotSummary["narrative"] }) {
  return (
    <p className="text-xs text-muted-foreground" role={state === "writing" ? "status" : undefined}>
      {state === "writing"
        ? "Writing commentary…"
        : state === "ready"
          ? "Commentary ready"
          : state === "failed"
            ? "Commentary failed"
            : "Commentary off"}
    </p>
  );
}
function ReportCard({ report }: { report: ReportSummary }) {
  const latest = report.lastSnapshot;
  return (
    <Link
      to="/reports/$reportId"
      params={{ reportId: report.id }}
      className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-muted/40"
    >
      <h3 className="font-medium">
        {report.title}
        {report.archivedAt ? " · Archived" : ""}
      </h3>
      <p className="text-xs text-muted-foreground">
        {latest ? `${date(latest.createdAt)} · ${latest.status}` : "Never run"}
      </p>
      <p className="text-xs text-muted-foreground">
        AI commentary {report.narrativeEnabled ? "on" : "off"}
      </p>
      {latest && <SnapshotCommentary state={latest.narrative} />}
    </Link>
  );
}
export function ReportsList() {
  const environmentId = usePrimaryEnvironmentId();
  return <ReportsListContent key={environmentId ?? "disconnected"} />;
}
function ReportsListContent() {
  const { rows: domains, environmentId, loaded: domainsLoaded, readFailed } = useDomains();
  const read = useAtomCommand(reports.list);
  const change = useReportChanges(environmentId);
  const [rows, setRows] = useState<readonly ReportSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDomain, setNewDomain] = useState(false);
  const environment = useEnvironment(environmentId);
  const canCreate = useAtomValue(reports.create.permissionAtom(environmentId));
  const refresh = useEffectEvent((destination = environmentId, _change = change) => {
    if (!destination) return Promise.resolve();
    return read({ environmentId: destination, input: { archived: true } }).then((result) => {
      setLoaded(true);
      setError(result._tag === "Success" ? "" : "Could not load reports. Try again.");
      if (result._tag === "Success") setRows(result.value);
    });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Report metadata is owned by the connected server and invalidated by its change stream.
  useEffect(() => {
    if (environment?.connection.phase === "connected") void refresh(environmentId, change);
  }, [environmentId, environment?.connection.phase, change]);
  const groups = groupReports(rows, domains, archived);
  return (
    <ReportPage>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Build reports for your domains and save each run.
          </p>
        </div>
        <Button
          disabled={!canCreate || !domainsLoaded}
          onClick={() => (domains.length ? setCreating(true) : setNewDomain(true))}
        >
          New report
        </Button>
      </header>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={archived} onCheckedChange={setArchived} />
        Show archived
      </label>
      {(error || readFailed) && (
        <p role="alert">
          {error || "Could not read your domains."}{" "}
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      )}
      {!loaded && <p role="status">Loading reports…</p>}
      {loaded && !error && !groups.length && (
        <section className="flex flex-col items-start gap-3 rounded-lg border p-8">
          <h2 className="font-medium">No reports yet</h2>
          <p className="text-sm text-muted-foreground">
            Choose a domain and a starter template to create your first report.
          </p>
          <Button
            disabled={!canCreate}
            onClick={() => (domains.length ? setCreating(true) : setNewDomain(true))}
          >
            New report
          </Button>
        </section>
      )}
      {environmentId &&
        groups.map((group) => (
          <section key={group.projectId} className="flex flex-col gap-3">
            <h2 className="font-medium">{group.hostname}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </section>
        ))}
      {creating && environmentId && (
        <NewReportDialog
          domains={domains}
          environmentId={environmentId}
          close={() => setCreating(false)}
        />
      )}
      <NewDomainDialog
        open={newDomain}
        onOpenChange={setNewDomain}
        onCreated={() => {
          setNewDomain(false);
          setCreating(true);
        }}
      />
    </ReportPage>
  );
}
function NewReportDialog({
  domains,
  environmentId,
  close,
}: {
  domains: readonly Domain[];
  environmentId: EnvironmentId;
  close(): void;
}) {
  const [projectId, setProjectId] = useState(domains[0]?.projectId ?? "");
  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  const [templates, setTemplates] = useState<readonly (typeof ReportTemplate.Type)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const domain = domains.find((row) => row.projectId === projectId);
  const { connection } = useDomainConnection(environmentId, projectId);
  const create = useAtomCommand(reports.create);
  const readTemplates = useAtomCommand(reports.templates);
  const canCreate = useAtomValue(reports.create.permissionAtom(environmentId));
  const navigate = useNavigate();
  const load = useEffectEvent(async (destination: EnvironmentId) =>
    readTemplates({ environmentId: destination, input: undefined }).then((result) => {
      if (result._tag === "Success") setTemplates(result.value);
      else setError("Could not load starter templates. You can still start with a blank report.");
    }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Load starter templates from the destination server when opening the dialog.
  useEffect(() => {
    void load(environmentId);
  }, [environmentId]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>New report</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canUseReportConnection(connection)) return;
              setBusy(true);
              setError("");
              void create({
                environmentId,
                input: {
                  projectId,
                  title: title.trim(),
                  ...(templateId === "blank" ? {} : { templateId }),
                },
              }).then(async (result) => {
                setBusy(false);
                if (result._tag === "Success") {
                  close();
                  await navigate({
                    to: "/reports/$reportId",
                    params: { reportId: result.value.id },
                  });
                } else setError("Could not create report. Try again.");
              });
            }}
          >
            <DomainChoice domains={domains} value={projectId} onChange={setProjectId} />
            <div className="flex flex-col gap-2">
              <label htmlFor="report-template" className="text-sm">
                Starter template
              </label>
              <Select
                value={templateId}
                onValueChange={(value) => {
                  if (value) setTemplateId(value);
                }}
              >
                <SelectTrigger id="report-template" aria-label="Starter template">
                  <SelectValue>
                    {templateId === "blank"
                      ? "Blank report"
                      : (templates.find((template) => template.id === templateId)?.title ??
                        "Choose template")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="blank">Blank report</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <label className="flex flex-col gap-2 text-sm">
              Title
              <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            {domain && <ConnectionGate domain={domain} environmentId={environmentId} />}
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={
                !canCreate ||
                busy ||
                !projectId ||
                !title.trim() ||
                !canUseReportConnection(connection)
              }
            >
              {busy ? "Creating…" : "Create report"}
            </Button>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
export function ReportDetail({ reportId }: { reportId: string }) {
  const { rows: domains, environmentId } = useDomains();
  return environmentId ? (
    <DetailContent
      key={`${environmentId}:${reportId}`}
      environmentId={environmentId}
      reportId={reportId}
      domains={domains}
    />
  ) : (
    <ReportPage>
      <p>Connect to an environment to view this report.</p>
    </ReportPage>
  );
}
function DetailContent({
  environmentId,
  reportId,
  domains,
}: {
  environmentId: EnvironmentId;
  reportId: string;
  domains: readonly Domain[];
}) {
  const mint = useAtomCommand(reports.links);
  const prepared = usePreparedConnection(environmentId);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [request, setRequest] = useState("");
  const [editError, setEditError] = useState("");
  const get = useAtomCommand(reports.get);
  const run = useAtomCommand(reports.run);
  const edit = useAtomCommand(reports.edit);
  const update = useAtomCommand(reports.update);
  const archive = useAtomCommand(reports.archive);
  const restore = useAtomCommand(reports.restore);
  const remove = useAtomCommand(reports.delete);
  const duplicate = useAtomCommand(reports.duplicate);
  const deleteSnapshot = useAtomCommand(reports.deleteSnapshot);
  const canRun = useAtomValue(reports.run.permissionAtom(environmentId));
  const canEdit = useAtomValue(reports.edit.permissionAtom(environmentId));
  const canUpdate = useAtomValue(reports.update.permissionAtom(environmentId));
  const canArchive = useAtomValue(reports.archive.permissionAtom(environmentId));
  const canRestore = useAtomValue(reports.restore.permissionAtom(environmentId));
  const canDelete = useAtomValue(reports.delete.permissionAtom(environmentId));
  const canDuplicate = useAtomValue(reports.duplicate.permissionAtom(environmentId));
  const canDeleteSnapshot = useAtomValue(reports.deleteSnapshot.permissionAtom(environmentId));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [target, setTarget] = useState(domains[0]?.projectId ?? "");
  const { snapshots, loaded, failed, refresh } = useSnapshots(environmentId, reportId);
  const change = useAtomValue(reportChangesForReport(JSON.stringify([environmentId, reportId])));
  const environment = useEnvironment(environmentId);
  const navigate = useNavigate();
  const load = useEffectEvent((destination = environmentId, id = reportId, _change = change) =>
    get({ environmentId: destination, input: { id } }).then((result) => {
      if (result._tag === "Success") {
        setReport(result.value);
        setError("");
      } else setError("Could not load report. It may have been deleted.");
    }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep this report synchronized with the server's lifecycle and change events.
  useEffect(() => {
    if (environment?.connection.phase === "connected") void load(environmentId, reportId, change);
  }, [environment?.connection.phase, reportId, environmentId, change]);
  const domain = domains.find((row) => row.projectId === report?.projectId);
  const { connection } = useDomainConnection(environmentId, report?.projectId);
  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0];
  const latest = snapshots[0];
  const editWithAi = async () => {
    setEditError("");
    setBusy(true);
    const result = await edit({
      environmentId,
      input: { id: reportId, ...(request.trim() ? { request: request.trim() } : {}) },
    });
    setBusy(false);
    if (result._tag === "Success") {
      revealReportPreview(
        scopeThreadRef(environmentId, ThreadId.make(result.value.threadId)),
        result.value.tabId,
      );
      await navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId, threadId: result.value.threadId },
      });
    } else {
      const failure = squashAtomCommandFailure(result);
      setEditError(
        failure instanceof Error ? failure.message : "Could not open the editing chat. Try again.",
      );
    }
  };
  if (!report)
    return (
      <ReportPage>
        <Link to="/reports">← Reports</Link>
        <p role={error ? "alert" : "status"}>{error || "Loading report…"}</p>
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </ReportPage>
    );
  return (
    <ReportPage>
      <Link to="/reports" className="text-sm text-muted-foreground">
        ← Reports
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {report.title}
            {report.archivedAt ? " · Archived" : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {domain?.hostname ?? "Domain unavailable"} ·{" "}
            {latest ? `Last run ${date(latest.createdAt)} · ${latest.status}` : "Never run"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={
              !canRun ||
              running ||
              busy ||
              !!report.archivedAt ||
              !canUseReportConnection(connection)
            }
            onClick={() => {
              setRunning(true);
              setError("");
              void run({ environmentId, input: { id: reportId } }).then(async (result) => {
                setRunning(false);
                if (result._tag === "Success") {
                  setSelectedId(result.value.id);
                  await refresh();
                } else setError("Report run failed. Check the connection and try again.");
              });
            }}
          >
            {running ? "Running…" : "Run now"}
          </Button>
          <Button
            variant="outline"
            disabled={!canEdit || busy || !canUseReportConnection(connection)}
            onClick={() => {
              setEditError("");
              setEditing(true);
            }}
          >
            Edit with AI
          </Button>
          <Menu>
            <MenuTrigger disabled={!selected || exporting} render={<Button variant="outline" />}>
              {exporting ? "Preparing export…" : "Export ▾"}
            </MenuTrigger>
            <MenuPopup>
              {(
                [
                  ["PDF", "pdf"],
                  ["PowerPoint", "pptx"],
                  ["HTML", "html"],
                ] as const
              ).map(([label, format]) => (
                <MenuItem
                  key={format}
                  onClick={() => {
                    if (!selected) return;
                    if (prepared._tag !== "Some") {
                      toastManager.add({
                        type: "error",
                        title: "Export failed",
                        description: "Reconnect to the environment and try again.",
                      });
                      return;
                    }
                    setExporting(true);
                    void fetchReportResource(
                      async (input) => {
                        const result = await mint({ environmentId, input });
                        if (result._tag !== "Success") {
                          const failure = squashAtomCommandFailure(result);
                          throw new Error(
                            failure instanceof Error
                              ? failure.message
                              : "Could not prepare the export. Reconnect and try again.",
                          );
                        }
                        return result.value;
                      },
                      { snapshotId: selected.id },
                      format,
                      prepared.value.httpBaseUrl,
                    )
                      .then((blob) =>
                        downloadReportBlob(
                          blob,
                          `${report.title.replace(/[\\/:*?"<>|]/g, "_")}.${format}`,
                        ),
                      )
                      .catch((error: unknown) =>
                        toastManager.add({
                          type: "error",
                          title: "Export failed",
                          description:
                            error instanceof Error ? error.message : "Could not export report.",
                        }),
                      )
                      .then(() => setExporting(false));
                  }}
                >
                  {label}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <Menu>
            <MenuTrigger aria-label="Report actions" render={<Button variant="ghost" />}>
              •••
            </MenuTrigger>
            <MenuPopup>
              <MenuItem disabled={!canDuplicate || busy} onClick={() => setDuplicating(true)}>
                Duplicate to domain
              </MenuItem>
              <MenuItem
                disabled={busy || (report.archivedAt ? !canRestore : !canArchive)}
                onClick={() => {
                  setBusy(true);
                  void (report.archivedAt ? restore : archive)({
                    environmentId,
                    input: { id: reportId },
                  }).then((result) => {
                    setBusy(false);
                    if (result._tag === "Success") setReport(result.value);
                    else setError("Could not change archive state.");
                  });
                }}
              >
                {report.archivedAt ? "Restore" : "Archive"}
              </MenuItem>
              <MenuItem
                variant="destructive"
                disabled={!canDelete || busy || running}
                onClick={() => {
                  void (async () => {
                    if (
                      !(await createLocalApi().dialogs.confirm(
                        `Delete “${report.title}” and all saved runs?`,
                        { variant: "destructive", confirmLabel: "Delete report" },
                      ))
                    )
                      return;
                    setBusy(true);
                    const result = await remove({ environmentId, input: { id: reportId } });
                    setBusy(false);
                    if (result._tag === "Success") await navigate({ to: "/reports" });
                    else setError("Could not delete report.");
                  })();
                }}
              >
                Delete
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </header>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={report.narrativeEnabled}
          disabled={!canUpdate || busy}
          onCheckedChange={(narrativeEnabled) => {
            setBusy(true);
            void update({ environmentId, input: { id: reportId, narrativeEnabled } }).then(
              (result) => {
                setBusy(false);
                if (result._tag === "Success") setReport(result.value);
                else setError("Could not update AI commentary.");
              },
            );
          }}
        />
        AI commentary
      </label>
      {error && <p role="alert">{error}</p>}
      {domain && <ConnectionGate domain={domain} environmentId={environmentId} />}
      {failed ? (
        <p role="alert">
          Could not load snapshot history.{" "}
          <Button variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      ) : !loaded ? (
        <p role="status">Loading saved runs…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <ReportDocument
            key={`${selected?.id ?? "preview"}:${selected?.narrative ?? "off"}`}
            environmentId={environmentId}
            reportId={reportId}
            snapshot={selected}
          />
          <aside className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="font-medium">Snapshot history</h2>
            {!snapshots.length && (
              <p className="text-sm text-muted-foreground">
                Run this report to save your first snapshot.
              </p>
            )}
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
                aria-current={selected?.id === snapshot.id ? "true" : undefined}
              >
                <Button
                  variant={selected?.id === snapshot.id ? "secondary" : "ghost"}
                  onClick={() => setSelectedId(snapshot.id)}
                >
                  {snapshot.period.label}
                </Button>
                <time className="text-xs text-muted-foreground" dateTime={snapshot.createdAt}>
                  {date(snapshot.createdAt)}
                </time>
                <p className="text-xs">
                  {snapshot.status} · {snapshot.errorCount} errors
                </p>
                <SnapshotCommentary state={snapshot.narrative} />
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canDeleteSnapshot || busy}
                  onClick={() => {
                    void (async () => {
                      if (
                        !(await createLocalApi().dialogs.confirm("Delete this saved run?", {
                          variant: "destructive",
                          confirmLabel: "Delete snapshot",
                        }))
                      )
                        return;
                      setBusy(true);
                      const result = await deleteSnapshot({
                        environmentId,
                        input: { id: snapshot.id },
                      });
                      setBusy(false);
                      if (result._tag === "Success") await refresh();
                      else setError("Could not delete snapshot.");
                    })();
                  }}
                >
                  Delete snapshot
                </Button>
              </div>
            ))}
          </aside>
        </div>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>What should change?</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void editWithAi();
              }}
            >
              <label className="flex flex-col gap-2 text-sm">
                Your request (optional)
                <Textarea
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="For example, compare this month with last month and highlight our top sources."
                />
              </label>
              {editError && <p role="alert">{editError}</p>}
              <Button
                type="submit"
                disabled={!canEdit || busy || !canUseReportConnection(connection)}
              >
                {busy ? "Opening…" : "Open editing chat"}
              </Button>
            </form>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Dialog open={duplicating} onOpenChange={setDuplicating}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Duplicate to domain</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <DomainChoice domains={domains} value={target} onChange={setTarget} />
              <Button
                disabled={!canDuplicate || !target || busy}
                onClick={() => {
                  setBusy(true);
                  void duplicate({
                    environmentId,
                    input: { id: reportId, targetProjectId: target },
                  }).then(async (result) => {
                    setBusy(false);
                    if (result._tag === "Success") {
                      setDuplicating(false);
                      await navigate({
                        to: "/reports/$reportId",
                        params: { reportId: result.value.id },
                      });
                    } else setError("Could not duplicate report.");
                  });
                }}
              >
                Duplicate
              </Button>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </ReportPage>
  );
}
