import { pageScript, type PageNode, type PageWindow } from "../page.ts";

export interface GoogleSearchSelectors {
  /** The results column. */
  readonly results: string;
  /** The AI Overview block; its embedded data and links are read as citations. */
  readonly overview: string;
  /** The overview's answer text inside the block. */
  readonly overviewBody: string;
  /** Organic result titles; each one's enclosing link is the result. */
  readonly organic: string;
  /** Ads, People Also Ask and feature packs, which are not organic results. */
  readonly exclude: string;
  /** Controls whose labels are not answer text, such as citation chips. */
  readonly skipText: string;
  /** A rendered formula; read from the LaTeX in its `data-xpm-latex`, or its MathML. */
  readonly formula: string;
}
/** In document order: a link, or the data Google embeds beside an element as a `…|||[json]` comment. */
export type GoogleOverviewItem =
  | { readonly kind: "link"; readonly url: string; readonly label: string }
  | { readonly kind: "data"; readonly json: string };
export interface GoogleOrganicItem {
  readonly url: string;
  readonly title: string;
  /** The link's text by lines: title, site name, displayed URL. */
  readonly text: string;
  readonly cite: string;
}
export interface GoogleSearchSnapshot {
  readonly url: string;
  readonly results: boolean;
  readonly overview: {
    readonly text: string;
    readonly items: readonly GoogleOverviewItem[];
  } | null;
  readonly organic: readonly GoogleOrganicItem[];
}

interface Node extends PageNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<Node> & Iterable<Node>;
  readonly parentElement: Node | null;
  matches(selector: string): boolean;
  querySelector(selector: string): Node | null;
  querySelectorAll(selector: string): ArrayLike<Node> & Iterable<Node>;
  closest(selector: string): Node | null;
}

/**
 * Reads the results page. Interpretation (which data is a citation, which domain a result is on)
 * happens in the app, so it can change without an extension release. `full` adds the citations
 * and organic results; polls leave them out.
 */
export const readGoogleSearch = pageScript(
  "readGoogleSearch",
  (arg: {
    readonly selectors: GoogleSearchSelectors;
    readonly full: boolean;
  }): GoogleSearchSnapshot => {
    const w = globalThis as unknown as PageWindow;
    const doc = w.document as unknown as Node;
    const s = arg.selectors;
    const style = (node: Node) => w.getComputedStyle(node);
    const hidden = (node: Node) => {
      const css = style(node);
      return css.display === "none" || css.visibility === "hidden";
    };
    // innerText, minus the skipped controls, with list markers so ranked lists survive.
    const text = (root: Node) => {
      const parts: string[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === 3) {
          parts.push((node.nodeValue ?? "").replace(/\s+/g, " "));
          return;
        }
        if (node.nodeType !== 1 || node.matches(s.skipText) || hidden(node)) return;
        // A formula reads as its characters, inline, without its spoken annotation.
        const latex = node.matches(s.formula)
          ? (node.getAttribute("data-xpm-latex") ??
            node.querySelector("[data-xpm-latex]")?.getAttribute("data-xpm-latex"))
          : null;
        if (latex) {
          parts.push(
            latex
              .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^}]*)\}/g, "$1")
              .replace(/\\(?:rightarrow|to|longrightarrow)\b/g, "→")
              .replace(/\\(?:rightleftharpoons|leftrightarrow)\b/g, "⇌")
              .replace(/\\times\b/g, "×")
              .replace(/\\cdot\b/g, "·")
              .replace(/\\hphantom\{[^}]*\}/g, "")
              .replace(/\\[,;:! ]/g, " ")
              .replace(/[_^]\{([^}]*)\}/g, "$1")
              .replace(/[_^]/g, "")
              .replace(/\\([a-zA-Z]+)/g, "$1")
              .replace(/[{}]/g, "")
              .replace(/\s+/g, " ")
              .trim(),
          );
          return;
        }
        if (node.tagName.toLowerCase() === "math") {
          const plain = (n: Node): string =>
            n.nodeType === 3
              ? (n.nodeValue ?? "")
              : n.nodeType === 1 && !/^annotation/i.test(n.tagName)
                ? [...n.childNodes].map(plain).join("")
                : "";
          parts.push(plain(node).replace(/\s+/g, " "));
          return;
        }
        if (node.tagName === "BR") parts.push("\n");
        const display = style(node).display;
        const block = display !== "contents" && !display.startsWith("inline");
        if (block) parts.push("\n");
        if (node.tagName === "LI") {
          const list = node.parentElement;
          const items = list ? [...list.childNodes].filter((n) => n.tagName === "LI") : [];
          parts.push(list?.tagName === "OL" ? `${items.indexOf(node) + 1}. ` : "- ");
        }
        for (const child of node.childNodes) walk(child);
        if (block) parts.push("\n");
      };
      walk(root);
      return parts
        .join("")
        .replace(/\u2060/g, "")
        .replace(/[ \t ]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
    };
    const root = [...doc.querySelectorAll(s.overview)].find((n) => !hidden(n)) ?? null;
    const items: GoogleOverviewItem[] = [];
    const collect = (node: Node) => {
      if (node.nodeType === 8) {
        const value = node.nodeValue ?? "";
        const at = value.indexOf("|||");
        if (at >= 0 && value.includes("http"))
          items.push({ kind: "data", json: value.slice(at + 3) });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === "A" && node.href)
        items.push({
          kind: "link",
          url: node.href,
          label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 300),
        });
      for (const child of node.childNodes) collect(child);
    };
    if (root && arg.full) collect(root);

    const container = doc.querySelector(s.results);
    const organic: GoogleOrganicItem[] = [];
    const seen = new Set<string>();
    const shown = (node: Node) => {
      for (let n: Node | null = node; n && n !== container; n = n.parentElement)
        if (hidden(n)) return false;
      return true;
    };
    for (const title of arg.full && container ? container.querySelectorAll(s.organic) : []) {
      const link = title.closest("a[href]");
      if (!link?.href || seen.has(link.href)) continue;
      if (link.closest(s.exclude) || link.closest(s.overview) || !shown(link)) continue;
      seen.add(link.href);
      let cite = link.querySelector("cite");
      for (let n = link.parentElement, up = 0; !cite && n && up < 6; n = n.parentElement, up++)
        cite = n.querySelector("cite");
      organic.push({
        url: link.href,
        title: text(title),
        text: text(link),
        cite: cite ? text(cite) : "",
      });
    }
    return {
      url: w.location.href,
      results: Boolean(container),
      overview: root ? { text: text(root.querySelector(s.overviewBody) ?? root), items } : null,
      organic,
    };
  },
);

/** Opens a collapsed AI Overview and its full source list; returns how many controls it clicked. */
export const expandGoogleOverview = pageScript(
  "expandGoogleOverview",
  (arg: { readonly selector: string }) => {
    const w = globalThis as unknown as PageWindow;
    const controls = [...w.document.querySelectorAll(arg.selector)];
    for (const control of controls) control.click();
    return controls.length;
  },
);

/**
 * On Google's full-page consent screen, chooses "Reject all", the choice that shares the least.
 * The consent dialog over a page is answered the same way only with `dialog`: over search
 * results it hides nothing, but over AI Mode it takes the clicks meant for the prompt box.
 */
export const rejectGoogleConsent = pageScript(
  "rejectGoogleConsent",
  (arg: {
    readonly rejectField: string;
    readonly rejectButton: string;
    readonly dialog?: true;
  }) => {
    const w = globalThis as unknown as PageWindow;
    if (!/^consent\.google\./.test(new URL(w.location.href).hostname)) {
      const button = arg.dialog ? w.document.querySelector(arg.rejectButton) : null;
      const box = button?.getBoundingClientRect();
      if (!button || !box?.width || !box.height) return "none";
      button.click();
      return "clicked";
    }
    const form = w.document.querySelector(arg.rejectField)?.closest("form");
    const button =
      form?.querySelector('button, input[type="submit"]') ??
      w.document.querySelector(arg.rejectButton);
    if (!button) return "missing";
    button.click();
    return "clicked";
  },
);
