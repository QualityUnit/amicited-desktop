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
        <p key={thread.id}>
          <Link
            to="/$environmentId/$threadId"
            params={{ environmentId: thread.environmentId, threadId: thread.id }}
          >
            {thread.title || "New task"}
          </Link>
        </p>
      ))}
    </>
  );
}
export const Route = createFileRoute("/_chat/tasks")({ component: Tasks });
