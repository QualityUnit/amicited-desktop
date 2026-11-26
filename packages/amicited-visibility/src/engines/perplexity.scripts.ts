import { pageScript } from "../page.ts";

/** The DOM and fetch slice Perplexity's scripts use, on top of `PageWindow`. */
interface Node {
  readonly nodeType: number;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<Node> & Iterable<Node>;
}
interface Element extends Node {
  readonly tagName: string;
  readonly parentElement: Element | null;
  readonly children: ArrayLike<Element> & Iterable<Element>;
  getAttribute(name: string): string | null;
  matches(selector: string): boolean;
  closest(selector: string): Element | null;
  contains(node: Node): boolean;
  compareDocumentPosition(node: Node): number;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element> & Iterable<Element>;
  getBoundingClientRect(): { readonly width: number; readonly height: number };
  click(): void;
}
interface Window {
  readonly location: { readonly href: string };
  readonly document: Element;
  fetch(
    url: string,
    init: object,
  ): Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;
}

/** Perplexity's own NextAuth session: `{}` signed out, `{ user, expires }` signed in. */
export const perplexitySession = pageScript(
  "perplexitySession",
  async (_arg: null): Promise<"signed_in" | "signed_out" | null> => {
    const w = globalThis as unknown as Window;
    try {
      const response = await w.fetch(new URL("/api/auth/session", w.location.href).href, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { readonly user?: unknown } | null;
      if (!body || typeof body !== "object") return null;
      return body.user ? "signed_in" : "signed_out";
    } catch {
      return null;
    }
  },
);

/** Gets the home page ready to ask: Search mode, and no promotional dialog over the composer. */
export const perplexityPrepare = pageScript("perplexityPrepare", (_arg: null): string[] => {
  const doc = (globalThis as unknown as Window).document;
  const done: string[] = [];
  // Computer mode starts a long agent task; a tracked prompt is an ordinary search.
  const search = doc.querySelector('button[aria-label="Search"][aria-pressed="false"]');
  if (search && doc.querySelector('button[aria-label="Computer"][aria-pressed="true"]')) {
    search.click();
    done.push("search_mode");
  }
  for (const dialog of doc.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
    if (dialog.querySelector('[data-testid="login-modal"]')) continue;
    const close = dialog.querySelector(
      'button[aria-label="Close"], button[aria-label*="close" i], button[aria-label*="dismiss" i]',
    );
    if (close) {
      close.click();
      done.push("closed_dialog");
    }
  }
  return done;
});

export interface PerplexityPageAnswer {
  readonly url: string;
  /** The thread as Perplexity's own API returns it, or null off a thread page or on an error. */
  readonly thread: {
    readonly entries: readonly {
      readonly status?: unknown;
      readonly query_str?: unknown;
      readonly blocks?: unknown;
    }[];
  } | null;
  /** The rendered answer, for when the API is unavailable. */
  readonly page: {
    readonly text: string;
    readonly links: readonly { readonly url: string; readonly title: string }[];
    /** The answer footer (copy, rate) shows once the answer finished. */
    readonly finished: boolean;
    readonly busy: boolean;
    /** Perplexity's sign-in sheet covers the page. */
    readonly gated: boolean;
  };
}
/**
 * Reads the latest answer twice: from the thread API the page itself uses (whole Markdown
 * answer, every source in citation order) and from the rendered page as a fallback.
 */
export const readPerplexityAnswer = pageScript(
  "readPerplexityAnswer",
  async (_arg: null): Promise<PerplexityPageAnswer> => {
    const w = globalThis as unknown as Window;
    const doc = w.document;
    const url = w.location.href;
    let thread: PerplexityPageAnswer["thread"] = null;
    const slug = /^\/(?:search|session)\/([^/?#]+)/.exec(new URL(url).pathname)?.[1];
    if (slug)
      try {
        const query =
          "with_parent_info=true&with_schematized_response=true&version=2.18&source=default&limit=10&offset=0&from_first=true";
        const response = await w.fetch(new URL(`/rest/thread/${slug}?${query}`, url).href, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const body = response.ok
          ? ((await response.json()) as { readonly entries?: unknown } | null)
          : null;
        if (body && Array.isArray(body.entries))
          thread = {
            entries: body.entries.map((e: Record<string, unknown>) => ({
              status: e.status,
              query_str: e.query_str,
              blocks: e.blocks,
            })),
          };
      } catch {
        thread = null;
      }

    const asks = [...doc.querySelectorAll("[data-message-bubble]")];
    const lastAsk = asks.at(-1);
    // Node.DOCUMENT_POSITION_FOLLOWING
    const afterAsk = (node: Element) =>
      !lastAsk || (lastAsk.compareDocumentPosition(node) & 4) !== 0;
    const outermost = (nodes: Element[]) =>
      nodes.filter((n) => !nodes.some((other) => other !== n && other.contains(n)));
    const candidates = (selector: string) =>
      outermost(
        [...doc.querySelectorAll(selector)].filter(
          (n) => !n.closest("[data-message-bubble]") && afterAsk(n),
        ),
      );
    let roots = candidates('[data-workflow-final-text] [data-renderer="lm"]');
    if (!roots.length) roots = candidates(".prose");

    const skip =
      'button, svg, script, style, img, .citation, .citation-nbsp, [data-pplx-citation], [aria-hidden="true"], [hidden]';
    const blockTags = new Set([
      "P",
      "DIV",
      "SECTION",
      "UL",
      "OL",
      "TABLE",
      "THEAD",
      "TBODY",
      "BLOCKQUOTE",
      "HR",
    ]);
    const lines: string[] = [];
    let line = "";
    let lead = "";
    const flush = () => {
      const indent = /^ */.exec(line)?.[0] ?? "";
      const text = indent + line.slice(indent.length).replace(/\s+/g, " ").trim();
      if (text.trim()) lines.push(text);
      line = "";
    };
    // A line starts with its list or heading marker; only that marker may indent it.
    const append = (text: string) => {
      if (!line) {
        if (!text.trim()) return;
        line = lead;
        lead = "";
        text = text.trimStart();
      }
      line += text;
    };
    const plain = (node: Node): string =>
      node.nodeType === 3
        ? (node.textContent ?? "")
        : node.nodeType === 1 && !(node as Element).matches(skip)
          ? [...node.childNodes].map(plain).join("")
          : "";
    const walk = (node: Node, depth: number): void => {
      if (node.nodeType === 3) return append(node.textContent ?? "");
      if (node.nodeType !== 1) return;
      const el = node as Element;
      if (el.matches(skip)) return;
      const tag = el.tagName.toUpperCase();
      if (tag === "BR") return flush();
      if (tag === "PRE") {
        flush();
        lines.push(el.textContent ?? "");
        return;
      }
      if (tag === "TR") {
        flush();
        const cells = [...el.children].map((c) => plain(c).replace(/\s+/g, " ").trim());
        lines.push(`| ${cells.join(" | ")} |`);
        return;
      }
      const heading = /^H([1-6])$/.exec(tag)?.[1];
      if (tag === "LI" || heading) {
        flush();
        const list = el.parentElement;
        const items = list
          ? [...list.children].filter((c) => c.tagName.toUpperCase() === "LI")
          : [];
        const start = Number(list?.getAttribute("start") ?? 1) || 1;
        lead = heading
          ? `${"#".repeat(Number(heading))} `
          : `${"  ".repeat(depth)}${list?.tagName.toUpperCase() === "OL" ? `${items.indexOf(el) + start}.` : "-"} `;
        for (const child of el.childNodes) walk(child, tag === "LI" ? depth + 1 : depth);
        flush();
        lead = "";
        return;
      }
      const block = blockTags.has(tag);
      if (block) flush();
      for (const child of el.childNodes) walk(child, depth);
      if (block) flush();
    };
    for (const root of roots) {
      walk(root, 0);
      flush();
    }

    const links: { url: string; title: string }[] = [];
    for (const root of roots)
      for (const node of root.querySelectorAll("[data-pplx-citation-url], a[href]")) {
        const href = node.getAttribute("data-pplx-citation-url") ?? node.getAttribute("href") ?? "";
        let target: URL;
        try {
          target = new URL(href, url);
        } catch {
          continue;
        }
        if (!/^https?:$/.test(target.protocol) || /(^|\.)perplexity\.ai$/.test(target.hostname))
          continue;
        const chip = node.closest(".citation, [data-pplx-citation]");
        links.push({
          url: target.href,
          title:
            node.getAttribute("title") ??
            node.getAttribute("aria-label") ??
            (chip ? "" : (node.textContent ?? "").trim()),
        });
      }

    const visible = (selector: string) =>
      [...doc.querySelectorAll(selector)].some((n) => {
        const box = n.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
    return {
      url,
      thread,
      page: {
        text: lines.join("\n"),
        links,
        finished: [...doc.querySelectorAll("[data-workflow-text-footer]")].some(afterAsk),
        busy: visible(
          'button[aria-label="Stop"], button[aria-label*="Stop generating" i], button[data-testid*="stop" i]',
        ),
        gated: !!doc.querySelector('[data-testid="login-modal"]'),
      },
    };
  },
);
