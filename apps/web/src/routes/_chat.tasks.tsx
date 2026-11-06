/* oxlint-disable shadcn/no-unknown-classes -- Marketing styles belong to @amicited/ui-marketing. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useThreadShells } from "../state/entities";
function Tasks() {
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
            {thread.latestRun?.status ?? "Ready to continue"} · {thread.createdAt.slice(0, 10)}
          </small>
        </article>
      ))}
    </>
  );
}
export const Route = createFileRoute("/_chat/tasks")({ component: Tasks });
