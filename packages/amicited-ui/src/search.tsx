import { getSideNavRowClass } from "./cloud/SideNavRow.js";
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { MarketingIcon, MarketingTooltip } from "./primitives.js";
export interface SearchItem {
  title: string;
  href: string;
  kind: "Tool" | "Recent result" | "Task";
  detail?: string;
}
export const MarketingSearchContext = createContext<readonly SearchItem[]>([]);
export function MarketingSearch({ navigate }: { navigate(path: string): void }) {
  const items = useContext(MarketingSearchContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const open = () => {
    setQuery("");
    setSelected(0);
    dialog.current?.showModal();
  };
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (
      event.key.toLowerCase() === "j" &&
      !(
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      )
    ) {
      event.preventDefault();
      navigate("/new");
    }
    if (event.key.toLowerCase() === "k") {
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
  const groups = (["Recent result", "Tool", "Task"] as const).map((kind) => ({
    kind,
    label: { "Recent result": "Recent results", Tool: "Tools", Task: "Tasks" }[kind],
    items: items.filter(
      (item) =>
        item.kind === kind &&
        item.title.toLowerCase().includes(query.toLowerCase()) &&
        (kind !== "Tool" ||
          !items.some((recent) => recent.kind === "Recent result" && recent.href === item.href)),
    ),
  }));
  const matches = groups.flatMap((group) => group.items);
  const activate = (item: SearchItem) => {
    dialog.current?.close();
    navigate(item.href);
  };
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
          <kbd>⌘+K</kbd>
        </button>
      </MarketingTooltip>
      <dialog
        ref={dialog}
        aria-label="Search tools, results and tasks"
        className="am-search-dialog border-ai-surf-2 bg-ai-surf w-full max-w-3xl overflow-hidden rounded-[4px] border shadow-2xl"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="border-ai-surf-2 flex items-center gap-2 border-b px-4 py-3">
          <MarketingIcon name="search" />
          <input
            autoFocus
            type="search"
            aria-label="Search tools, results and tasks"
            aria-activedescendant={matches[selected] ? `am-search-${selected}` : undefined}
            placeholder="Search tools, results and tasks…"
            className="text-ai-ink placeholder:text-ai-ink-4 min-w-0 flex-1 border-none bg-transparent text-sm focus:ring-0 focus:outline-none"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp"].includes(event.key) && matches.length) {
                event.preventDefault();
                const next =
                  (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
                  matches.length;
                setSelected(next);
                document.getElementById(`am-search-${next}`)?.scrollIntoView({ block: "nearest" });
              }
              if (event.key === "Enter" && matches[selected]) {
                event.preventDefault();
                activate(matches[selected]);
              }
            }}
          />
          <button
            type="button"
            aria-label="Close search"
            className="text-ai-ink-4 hover:bg-ai-bg hover:text-ai-ink-2 rounded-md p-1"
            onClick={() => dialog.current?.close()}
          >
            <svg
              aria-hidden="true"
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="am-search-results max-h-[50vh] overflow-y-auto">
          <div className="flex flex-col gap-0.5 p-1.5">
            {groups
              .filter((group) => group.items.length)
              .map((group) => (
                <div
                  key={group.kind}
                  role="group"
                  aria-label={group.label}
                  className="flex flex-col gap-0.5"
                >
                  <span
                    aria-hidden="true"
                    className="text-ai-ink-4 px-4 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase"
                  >
                    {group.label}
                  </span>
                  {group.items.map((item) => {
                    const index = matches.indexOf(item);
                    return (
                      <a
                        key={item.href}
                        id={`am-search-${index}`}
                        aria-label={`${item.title} ${item.kind}`}
                        href={item.href}
                        data-selected={selected === index}
                        className="rounded-[4px]"
                        onClick={(event) => {
                          event.preventDefault();
                          activate(item);
                        }}
                      >
                        <span>{item.title}</span>
                        {item.detail && <small>{item.detail}</small>}
                      </a>
                    );
                  })}
                </div>
              ))}
          </div>
          {!matches.length && (
            <p className="text-ai-ink-4 px-4 py-8 text-center text-sm">
              No matching tools, results or tasks.
            </p>
          )}
        </div>
        <div className="border-ai-surf-2 text-ai-ink-4 flex items-center gap-3 border-t px-4 py-2 text-xs">
          {[
            ["↑↓", "Navigate"],
            ["↵", "Open"],
            ["esc", "Close"],
          ].map(([key, label]) => (
            <span key={key}>
              <kbd className="bg-ai-bg rounded px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>{" "}
              {label}
            </span>
          ))}
        </div>
      </dialog>
    </>
  );
}
