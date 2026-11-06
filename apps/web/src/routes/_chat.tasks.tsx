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
      <h2>Tasks</h2>
      <p>Your AI work, in one place.</p>
      <section className="am-card am-task-list">
        {threads.map((thread) => (
          <article className="am-task-row" key={thread.id}>
            <Link
              to="/$environmentId/$threadId"
              params={{ environmentId: thread.environmentId, threadId: thread.id }}
            >
              <h2>{thread.title || "New task"}</h2>
            </Link>
            <span className="am-status am-status-neutral">
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
          </article>
        ))}
      </section>
    </>
  );
}
export const Route = createFileRoute("/_chat/tasks")({ component: Tasks });
