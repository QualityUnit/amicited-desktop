import { pageScript } from "../page.ts";

/**
 * Signed-out visitors get a server-rendered page (`li[data-message-role]`, pills are buttons);
 * signed-in accounts get the React app (`[data-message-author-role]`, pills are links).
 * Scripts return raw page data; `chatgpt.ts` merges it and ships without an extension release.
 */
interface ChatNode {
  readonly nodeType: number;
  readonly tagName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<ChatNode>;
  readonly id: string;
  readonly href?: string;
  readonly value?: string;
  readonly open?: boolean;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): ChatNode | null;
  querySelectorAll(selector: string): ArrayLike<ChatNode> & Iterable<ChatNode>;
  closest(selector: string): ChatNode | null;
  click(): void;
  close?(): void;
}
interface ChatWindow {
  readonly document: ChatNode & { readonly body: ChatNode | null };
  setTimeout(callback: () => void, ms: number): unknown;
}

export interface ChatGptStatus {
  readonly ui: "octane" | "classic" | null;
  /** The prompt shows as a sent message. */
  readonly sent: boolean;
  readonly found: boolean;
  /** Characters of answer text so far. */
  readonly chars: number;
  readonly complete: boolean;
  /** The "Searching the web" phase is showing. */
  readonly searching: boolean;
  /** A limit, error or abuse notice on the page, when there is no answer text. */
  readonly notice: string | null;
  /** A sign-in sheet or modal is open. */
  readonly loginPrompt: boolean;
}

/** Polled while waiting: where the conversation stands. */
export const chatgptStatus = pageScript(
  "chatgptStatus",
  (_arg: Record<string, never>): ChatGptStatus => {
    const w = globalThis as unknown as ChatWindow;
    const d = w.document;
    const octane = d.querySelector("[data-message-role], form[data-mobile-composer]") !== null;
    const classic = !octane && d.querySelector("#prompt-textarea, [data-message-author-role]");
    const role = octane ? "li[data-message-role" : "[data-message-author-role";
    const node = [...d.querySelectorAll(`${role}="assistant"]`)].at(-1) ?? null;
    const root = node
      ? octane
        ? node.querySelector("[data-assistant-markdown-root]")
        : (node.querySelector(".markdown") ?? node)
      : null;
    const chars = (root?.textContent ?? "").trim().length;
    const turn = node
      ? (node.closest('article, [data-testid^="conversation-turn"]') ?? node)
      : null;
    const stop = d.querySelector(
      '[data-testid="stop-button"], button[aria-label="Stop streaming"], button[data-composer-submit][aria-label="Stop generating"]',
    );
    const state = d.querySelector('input[name="conversationState"]');
    const complete =
      node !== null &&
      (octane
        ? node.hasAttribute("data-message-complete") &&
          !node.hasAttribute("data-message-streaming") &&
          (state === null || (state.value ?? "").includes(node.id))
        : stop === null);
    const page = (d.querySelector("main") ?? d.body)?.textContent ?? "";
    const notice =
      chars > 0
        ? null
        : (/(you[’']ve (reached|hit) [^.!]{0,80}(limit|cap)[^.!]{0,120}|too many requests[^.!]{0,80}|unusual activity[^.!]{0,120}|something went wrong[^.!]{0,120}|an error occurred[^.!]{0,120}|network error[^.!]{0,80})/i.exec(
            page,
          )?.[0] ?? null);
    const dialogs = [...d.querySelectorAll('dialog[open], [role="dialog"]')];
    return {
      ui: octane ? "octane" : classic ? "classic" : null,
      sent: d.querySelector(`${role}="user"]`) !== null,
      found: node !== null,
      chars,
      complete,
      searching: /search(ing|ed) (the web|\d+ sites?)/i.test(turn?.textContent ?? ""),
      notice: notice?.trim() ?? null,
      loginPrompt:
        d.querySelector("#mobile-auth-dialog[open]") !== null ||
        dialogs.some((n) => /log in or sign up|stay logged out/i.test(n.textContent ?? "")),
    };
  },
);

/** Closes a dismissible sign-in prompt so the composer takes input again. */
export const chatgptDismiss = pageScript("chatgptDismiss", (_arg: Record<string, never>) => {
  const d = (globalThis as unknown as ChatWindow).document;
  const sheet = d.querySelector("#mobile-auth-dialog[open]");
  if (sheet) {
    (sheet.querySelector('button[aria-label="Close"]') ?? sheet.querySelector("button"))?.click();
    return true;
  }
  const stay = [...d.querySelectorAll('a, button, [role="button"]')].find((n) =>
    /^stay logged out$/i.test((n.textContent ?? "").trim()),
  );
  stay?.click();
  return stay !== undefined;
});

export interface ChatGptRead {
  readonly ui: "octane" | "classic" | null;
  /** The answer as plain text, with list markers and table rows. */
  readonly text: string;
  /** The answer's markdown, which carries every citation URL in order (signed-out page only). */
  readonly markdown: string | null;
  /** Links in the rendered answer, in order. */
  readonly links: readonly { readonly url: string; readonly title: string }[];
  /** Citation pills plus a Sources button: the answer used web search. */
  readonly citations: number;
  readonly sourcesButton: boolean;
}

/** Reads the last answer: its text, links and markdown. */
export const chatgptRead = pageScript("chatgptRead", (_arg: Record<string, never>): ChatGptRead => {
  const d = (globalThis as unknown as ChatWindow).document;
  const octane = d.querySelector("[data-message-role], form[data-mobile-composer]") !== null;
  const node =
    [
      ...d.querySelectorAll(
        octane ? 'li[data-message-role="assistant"]' : '[data-message-author-role="assistant"]',
      ),
    ].at(-1) ?? null;
  const empty = { text: "", markdown: null, links: [], citations: 0, sourcesButton: false };
  if (!node)
    return {
      ui: octane ? "octane" : d.querySelector("#prompt-textarea") ? "classic" : null,
      ...empty,
    };
  const root = octane
    ? (node.querySelector("[data-assistant-markdown-root]") ?? node)
    : (node.querySelector(".markdown") ?? node);
  const pill =
    '[role="group"][aria-label="Sources"], [data-testid="webpage-citation-pill"], span[data-state] > a[href*="utm_source=chatgpt.com"]';
  const isPill = (n: ChatNode) =>
    n.getAttribute("data-testid") === "webpage-citation-pill" ||
    (n.getAttribute("role") === "group" && n.getAttribute("aria-label") === "Sources") ||
    (n.tagName === "SPAN" &&
      n.hasAttribute("data-state") &&
      n.querySelector('a[href*="utm_source=chatgpt.com"]') !== null &&
      (n.textContent ?? "").trim().length < 40);
  const skipped = (n: ChatNode) =>
    /^(SCRIPT|STYLE|SVG|IMG|TEMPLATE)$/i.test(n.tagName) ||
    n.hasAttribute("hidden") ||
    n.getAttribute("aria-hidden") === "true" ||
    n.hasAttribute("data-message-content-controls") ||
    (n.tagName === "BUTTON" && n.hasAttribute("aria-label")) ||
    isPill(n);

  // Renders block structure as lines: "- item", "1. item", "a | b" for table rows.
  const lines: string[] = [];
  let line: { indent: string; marker: string; text: string } | null = null;
  const end = () => {
    if (line && line.text.trim())
      lines.push(line.indent + line.marker + line.text.replace(/\s+/g, " ").trim());
    line = null;
  };
  const start = (indent: string, marker = "") => {
    end();
    line = { indent, marker, text: "" };
  };
  const gap = () => {
    end();
    if (lines.length && lines.at(-1) !== "") lines.push("");
  };
  const walk = (n: ChatNode, indent: string) => {
    if (n.nodeType === 3) {
      line ??= { indent, marker: "", text: "" };
      line.text += n.textContent ?? "";
      return;
    }
    if (n.nodeType !== 1 || skipped(n)) return;
    const tag = n.tagName.toUpperCase();
    const children = () => {
      for (const child of Array.from(n.childNodes)) walk(child, indent);
    };
    if (tag === "BR") return start(indent);
    if (tag === "HR") return gap();
    if (tag === "PRE") {
      gap();
      lines.push(...(n.textContent ?? "").replace(/\n$/, "").split("\n"));
      return gap();
    }
    if (tag === "UL" || tag === "OL") {
      end();
      let number = Number(n.getAttribute("start") ?? 1);
      for (const item of Array.from(n.childNodes)) {
        if (item.nodeType !== 1 || item.tagName.toUpperCase() !== "LI") continue;
        start(indent, tag === "OL" ? `${number++}. ` : "- ");
        for (const child of Array.from(item.childNodes)) walk(child, `${indent}  `);
        end();
      }
      if (!indent) gap();
      return;
    }
    if (tag === "TR") {
      start(indent);
      const cells = Array.from(n.childNodes).filter((c) => c.nodeType === 1);
      cells.forEach((cell, i) => {
        if (i > 0 && line) line.text += " | ";
        for (const child of Array.from(cell.childNodes)) walk(child, indent);
      });
      return end();
    }
    if (tag === "TABLE") {
      gap();
      children();
      return gap();
    }
    if (/^(P|DIV|SECTION|H[1-6]|BLOCKQUOTE|LI|DL|DT|DD|FIGURE|THEAD|TBODY)$/.test(tag)) {
      // A paragraph inside a list item continues the item's line.
      const continues = line !== null && !(line as { text: string }).text.trim();
      if (!continues) start(indent);
      children();
      if (/^(P|H[1-6]|BLOCKQUOTE)$/.test(tag) && !indent) gap();
      else end();
      return;
    }
    children();
  };
  walk(root, "");
  end();
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const links = [...root.querySelectorAll("a[href]")]
    .filter((a) => /^https?:/.test(a.href ?? ""))
    .map((a) => ({
      url: a.href ?? "",
      title: a.closest(pill) ? "" : (a.textContent ?? "").replace(/\s+/g, " ").trim(),
    }));
  let markdown: string | null = null;
  if (octane)
    for (const input of d.querySelectorAll('input[name="conversationState"]')) {
      try {
        const state = JSON.parse(input.value ?? "") as {
          messages?: { id?: string; role?: string; content?: unknown }[];
        };
        const message = state.messages?.find((m) => m.id === node.id && m.role === "assistant");
        if (typeof message?.content === "string") markdown = message.content;
      } catch {
        // A state the page is still writing is read again on the next attempt.
      }
    }
  const turn = node.closest('li, article, [data-testid^="conversation-turn"]') ?? node;
  return {
    ui: octane ? "octane" : "classic",
    text,
    markdown,
    links,
    citations: root.querySelectorAll(pill).length,
    sourcesButton: [...turn.querySelectorAll("button")].some(
      (b) =>
        (b.textContent ?? "").trim() === "Sources" || b.getAttribute("aria-label") === "Sources",
    ),
  };
});

export interface ChatGptCitation {
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
}

/**
 * Opens each citation pill and the Sources panel of the last answer and reads the titles
 * they list. The signed-out page lists a pill's sources only while that pill is open.
 */
export const chatgptCitations = pageScript(
  "chatgptCitations",
  async (arg: { readonly waitMs: number }): Promise<ChatGptCitation[]> => {
    const w = globalThis as unknown as ChatWindow;
    const d = w.document;
    const sleep = (ms: number) => new Promise<void>((resolve) => w.setTimeout(resolve, ms));
    const octane = d.querySelector("[data-message-role]") !== null;
    const node =
      [
        ...d.querySelectorAll(
          octane ? 'li[data-message-role="assistant"]' : '[data-message-author-role="assistant"]',
        ),
      ].at(-1) ?? null;
    if (!node) return [];
    const turn = node.closest('li, article, [data-testid^="conversation-turn"]') ?? node;
    const panels =
      '#assistant-sources-dialog[open], [data-assistant-sources-dialog], [data-testid="screen-threadFlyOut"], [data-testid*="sources" i], aside, [role="dialog"]';
    const found = new Map<string, ChatGptCitation>();
    const collect = () => {
      let added = 0;
      for (const panel of d.querySelectorAll(panels)) {
        if (panel.closest("#mobile-auth-dialog, #cookie-consent, nav")) continue;
        if (!/sources|citations/i.test(panel.textContent ?? "")) continue;
        for (const a of panel.querySelectorAll("a[href]")) {
          const url = a.href ?? "";
          if (!/^https?:/.test(url) || /^https?:\/\/([\w-]+\.)?chatgpt\.com\//.test(url)) continue;
          if (found.has(url)) continue;
          const heading = a.querySelector('strong, [class*="line-clamp"], h3, h4');
          const label = a.querySelector("span > span:last-child, [class*='text-xs']");
          found.set(url, {
            url,
            title: (heading?.textContent ?? a.textContent ?? "").replace(/\s+/g, " ").trim(),
            publisher: heading ? (label?.textContent ?? "").trim() : "",
          });
          added++;
        }
      }
      return added;
    };
    const open = async (control: ChatNode) => {
      const dialog = d.querySelector("#assistant-sources-dialog");
      if (dialog?.open) dialog.close?.();
      control.click();
      for (let waited = 0; waited < arg.waitMs; waited += 100) {
        if (collect() > 0) return;
        await sleep(100);
      }
    };
    collect();
    if (octane)
      for (const pill of node.querySelectorAll(
        '[role="group"][aria-label="Sources"] button[aria-haspopup]',
      ))
        await open(pill);
    const sources = [...turn.querySelectorAll("button")].find(
      (b) =>
        (b.textContent ?? "").trim() === "Sources" || b.getAttribute("aria-label") === "Sources",
    );
    if (sources) await open(sources);
    d.querySelector("#assistant-sources-dialog")?.close?.();
    return [...found.values()];
  },
);
