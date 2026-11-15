import type { ComponentType, ComponentProps } from "react";
import {
  FileDiffIcon,
  FolderIcon,
  GitBranchIcon,
  MonitorIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { MarketingTooltip } from "./primitives.js";
export function MarketingThreadLocation({
  machine,
  folder,
  branch,
  pullRequests,
  onReview,
  rowClassName,
  Action,
}: {
  rowClassName: string;
  Action: ComponentType<ComponentProps<"button"> & { href?: string }>;
  machine: string;
  folder: string | null | undefined;
  branch: string | null | undefined;
  pullRequests: readonly { url: string; number: number }[] | undefined;
  onReview: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col p-1">
      <span className={rowClassName}>
        <MonitorIcon className="size-3.5 shrink-0" />
        {machine}
      </span>
      {folder ? (
        <MarketingTooltip label={folder}>
          <span className={rowClassName}>
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{folder}</span>
          </span>
        </MarketingTooltip>
      ) : null}
      {branch ? (
        <span className={rowClassName}>
          <GitBranchIcon className="size-3.5 shrink-0" />
          {branch}
        </span>
      ) : null}
      {pullRequests?.map((pr) => (
        <Action key={pr.url} href={pr.url}>
          <ExternalLinkIcon className="size-3.5 shrink-0" />
          Open pull request #{pr.number}
        </Action>
      ))}
      <Action type="button" disabled={!onReview} onClick={onReview}>
        <FileDiffIcon className="size-3.5 shrink-0" />
        Changed files · Review
      </Action>
    </div>
  );
}
