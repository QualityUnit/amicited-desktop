import { useEffect, useEffectEvent, useState } from "react";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";

const searchWorkspaces = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.account.searchWorkspaces",
  label: "account:searchWorkspaces",
});
type Found = { readonly id: string; readonly name: string };

/** Searches every workspace in the account, since sign-in only keeps the first page. */
export function useWorkspaceSearch(query: string) {
  const environmentId = usePrimaryEnvironmentId();
  const search = useEffectEvent(useAtomCommand(searchWorkspaces, { reportFailure: false }));
  const [result, setResult] = useState<{ term: string; rows: readonly Found[] } | null>(null);
  const term = query.trim();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Debounced server search for the typed term.
  useEffect(() => {
    if (!environmentId || !term) return;
    let live = true;
    const timer = setTimeout(() => {
      void search({ environmentId, input: { query: term } })
        .catch(() => undefined)
        .then((found) => {
          if (live) setResult({ term, rows: found?._tag === "Success" ? found.value : [] });
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [environmentId, term]);
  const done = !!term && result?.term === term;
  return { rows: done ? result.rows : [], searching: !!term && !done };
}
