import { getSideNavRowClass } from "./cloud/SideNavRow.js";
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { MarketingInput, MarketingIcon, MarketingTooltip } from "./primitives.js";
export interface SearchItem {
  title: string;
  href: string;
  kind: "Tool" | "Recent result" | "Task";
}
export const MarketingSearchContext = createContext<readonly SearchItem[]>([]);
export function MarketingSearch({ navigate }: { navigate(path: string): void }) {
  const items = useContext(MarketingSearchContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const open = () => {
    setQuery("");
    dialog.current?.showModal();
  };
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
      event.preventDefault();
      navigate("/new");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Register the marketer keyboard shortcut for the mounted shell.
  useEffect(() => {
    const key = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const matches = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <MarketingTooltip label="Search" enabled>
        <button
          type="button"
          className={getSideNavRowClass() + " am-search-row"}
          aria-label="Search"
          onClick={open}
        >
          <MarketingIcon name="search" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </MarketingTooltip>
      <dialog
        ref={dialog}
        aria-label="Search tools, results and tasks"
        className="am-search-dialog border-ai-surf-2 bg-ai-surf w-full max-w-3xl overflow-hidden rounded-[4px] border shadow-2xl"
      >
        <form method="dialog">
          <button aria-label="Close search">Close</button>
        </form>
        <MarketingInput
          autoFocus
          type="search"
          aria-label="Search tools, results and tasks"
          placeholder="Search tools, results and tasks…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="am-search-results">
          {matches.map((item) => (
            <a
              key={item.kind + item.href}
              href={item.href}
              onClick={(event) => {
                event.preventDefault();
                dialog.current?.close();
                navigate(item.href);
              }}
            >
              <span>{item.title}</span>
              <small>{item.kind}</small>
            </a>
          ))}
        </div>
        {!matches.length && <p>No matching tools, results or tasks.</p>}
      </dialog>
    </>
  );
}
