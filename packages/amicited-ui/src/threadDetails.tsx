import { FolderIcon, GitBranchIcon, MonitorIcon, ExternalLinkIcon } from "lucide-react";
import { MarketingTooltip } from "./primitives.js";
export function MarketingThreadLocation({
  machine,
  folder,
  branch,
  pullRequests,
  onReview,
}: {
  machine: string;
  folder: string | null | undefined;
  branch: string | null | undefined;
  pullRequests: readonly { url: string; number: number }[] | undefined;
  onReview: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <MonitorIcon className="size-3.5 shrink-0" />
        {machine}
      </span>
      {folder ? (
        <MarketingTooltip label={folder}>
          <span className="flex min-w-0 items-center gap-2">
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{folder}</span>
          </span>
        </MarketingTooltip>
      ) : null}
      {branch ? (
        <span className="flex items-center gap-2">
          <GitBranchIcon className="size-3.5 shrink-0" />
          {branch}
        </span>
      ) : null}
      {pullRequests?.map((pr) => (
        <a
          key={pr.url}
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 underline"
        >
          <ExternalLinkIcon className="size-3.5 shrink-0" />
          Open pull request #{pr.number}
        </a>
      ))}
      <button
        type="button"
        disabled={!onReview}
        className="text-left underline disabled:opacity-50"
        onClick={onReview}
      >
        Changed files · Review
      </button>
    </div>
  );
}
