/* oxlint-disable shadcn/no-unknown-classes -- Marketing styles belong to @amicited/ui-marketing. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useThreadShells } from "../state/entities";
function Tasks() {
  const [now] = useState(() => Date.now());
  const threads = useThreadShells();
  return (
    <>
      <h1>Tasks</h1>
      <p>Your AI work, in one place.</p>
      <Link to="/new">New task</Link>
      {threads.map((thread) => (
        <article className="am-card" key={thread.id}>
          <p className="am-eyebrow">Task</p>
          <Link
            to="/$environmentId/$threadId"
            params={{ environmentId: thread.environmentId, threadId: thread.id }}
          >
            <h2>{thread.title || "New task"}</h2>
            <p>Open task →</p>
          </Link>
          <small>
            {thread.latestRun?.status === "completed"
              ? "Done"
              : thread.latestRun?.status === "running"
                ? "Working"
                : "Needs you"}{" "}
            ·{" "}
            {new Date(thread.createdAt).toDateString() === new Date(now).toDateString()
              ? "Today"
              : new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
                  -Math.max(1, Math.round((now - Date.parse(thread.createdAt)) / 86400000)),
                  "day",
                )}
          </small>
        </article>
      ))}
    </>
  );
}
export const Route = createFileRoute("/_chat/tasks")({ component: Tasks });
