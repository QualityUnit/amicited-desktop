import { marketingTaskStatus } from "@amicited/ui-marketing";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing styles belong to @amicited/ui-marketing. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useThreadShells } from "../state/entities";
function Tasks() {
  const [now] = useState(() => Date.now());
  const threads = useThreadShells();
  return (
    <>
      <section className="am-card am-task-list">
        <h1 className="text-sm font-semibold">Recent tasks</h1>
        {!threads.length && (
          <p>
            No tasks yet. <Link to="/new">New task →</Link>
          </p>
        )}
        {threads.map((thread) => (
          <Link
            className="am-task-row"
            key={thread.id}
            to="/$environmentId/$threadId"
            params={{ environmentId: thread.environmentId, threadId: thread.id }}
          >
            <h2>{thread.title || "New task"}</h2>
            <span
              className={`am-status am-status-${thread.hasPendingApprovals || thread.hasPendingUserInput ? "warn" : thread.latestRun?.status === "completed" ? "pass" : thread.latestRun?.status === "failed" ? "fail" : thread.latestRun?.status === "running" ? "active" : "neutral"}`}
            >
              {marketingTaskStatus(
                thread.latestRun?.status,
                thread.hasPendingApprovals || thread.hasPendingUserInput,
              )}
            </span>
            <time dateTime={thread.updatedAt}>
              {new Date(thread.updatedAt).toDateString() === new Date(now).toDateString()
                ? "Today"
                : new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
                    -Math.max(1, Math.round((now - Date.parse(thread.updatedAt)) / 86400000)),
                    "day",
                  )}
            </time>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </>
  );
}
export const Route = createFileRoute("/_chat/tasks")({ component: Tasks });
