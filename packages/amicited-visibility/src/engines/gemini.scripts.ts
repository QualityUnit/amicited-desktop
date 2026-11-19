import { pageScript, type PageNode, type PageWindow } from "../page.ts";

/** The extra DOM these scripts walk: text nodes, `matches` and timers. */
interface GeminiNode extends PageNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly localName?: string;
  readonly childNodes: ArrayLike<GeminiNode> & Iterable<GeminiNode>;
  readonly children: ArrayLike<GeminiNode> & Iterable<GeminiNode>;
  matches(selector: string): boolean;
  closest(selector: string): GeminiNode | null;
  querySelector(selector: string): GeminiNode | null;
  querySelectorAll(selector: string): ArrayLike<GeminiNode> & Iterable<GeminiNode>;
}
interface GeminiWindow extends Omit<PageWindow, "document"> {
  readonly document: GeminiNode;
  setTimeout(handler: () => void, ms: number): unknown;
}
export interface GeminiLink {
  readonly url: string;
  readonly title: string;
}

interface GeminiPageState {
  /** `consent` means a consent screen was just answered and the page is moving on. */
  readonly step: "ready" | "consent" | "signin";
  readonly signedIn: boolean;
}
/**
 * Answers Google's consent screen with "Reject all" (on gemini.google.com or consent.google.com)
 * and reports a sign-in interstitial. Rejecting keeps the user's choices as private as possible.
 */
export const prepareGemini = pageScript("prepareGemini", (_arg: null): GeminiPageState => {
  const w = globalThis as unknown as GeminiWindow;
  const shown = (node: GeminiNode | null) => {
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  // Gemini keeps the Google bar's account link in the DOM but hides it.
  const signedIn = !!w.document.querySelector('a[href*="accounts.google.com/SignOutOptions"]');
  const host = new URL(w.location.href).hostname;
  if (host === "accounts.google.com") return { step: "signin", signedIn };
  // consent.google.com posts "Reject all" from the form that sets set_eom=true.
  const reject =
    host === "consent.google.com"
      ? (w.document
          .querySelector('input[name="set_eom"][value="true"]')
          ?.closest("form")
          ?.querySelector("button") ?? null)
      : w.document.querySelector('button[data-test-id="reject-button"]');
  if (reject && shown(reject)) {
    reject.click();
    return { step: "consent", signedIn };
  }
  return { step: "ready", signedIn };
});

/**
 * Opens each inline citation chip of the latest answer and reads the source cards it shows.
 * Gemini renders the URLs only in that popover, and drops the chips about 25 seconds after an
 * answer completes, so this runs right after the answer settles.
 */
export const openGeminiSources = pageScript(
  "openGeminiSources",
  async (arg: { readonly openMs: number }): Promise<GeminiLink[][]> => {
    const w = globalThis as unknown as GeminiWindow;
    const root = [...w.document.querySelectorAll("model-response")].at(-1);
    if (!root) return [];
    const cards = (scope: GeminiNode) =>
      [...scope.querySelectorAll("inline-source-card a[href]")].map((a) => ({
        url: a.href ?? "",
        title: (a.querySelector(".title")?.textContent ?? a.textContent ?? "").trim(),
      }));
    // The popover is a keyboard dialog: untrusted clicks do not open it, Enter does.
    const key = (node: GeminiNode, name: "Enter" | "Escape") => {
      const code = name === "Enter" ? 13 : 27;
      for (const type of ["keydown", "keyup"])
        node.dispatchEvent(
          new w.KeyboardEvent(type, {
            key: name,
            code: name,
            keyCode: code,
            which: code,
            bubbles: true,
            cancelable: true,
          }),
        );
    };
    const all: GeminiLink[][] = [];
    for (const chip of root.querySelectorAll("source-inline-chip")) {
      let found = cards(chip);
      const button = chip.querySelector("button");
      if (found.length === 0 && button) {
        button.focus();
        key(button, "Enter");
        for (let waited = 0; ; waited += 100) {
          found = cards(chip);
          if (found.length > 0 || waited >= arg.openMs) break;
          await new Promise<void>((resolve) => w.setTimeout(resolve, 100));
        }
        key(button, "Escape");
      }
      all.push(found);
    }
    return all;
  },
);

interface GeminiAnswer {
  readonly found: boolean;
  readonly text: string;
  readonly links: readonly GeminiLink[];
  /** A usage-limit banner shown instead of, or after, the answer. */
  readonly notice: string | null;
}
/**
 * Renders the latest answer as plain text: list markers, `|` tables and fenced code survive,
 * citation chips, footnotes and Gemini's own buttons do not. Links come back in reading
 * order, with each chip's sources (from `openGeminiSources`) where the chip sits.
 */
export const readGeminiAnswer = pageScript(
  "readGeminiAnswer",
  (arg: { readonly chipSources: readonly (readonly GeminiLink[])[] }): GeminiAnswer => {
    const w = globalThis as unknown as GeminiWindow;
    const banner = w.document.querySelector('[data-test-id="inline-upgrade-banner-title"]');
    const notice = banner?.textContent?.trim() || null;
    const root = [...w.document.querySelectorAll("model-response")].at(-1);
    const panel = root?.querySelector("message-content .markdown") ?? null;
    if (!root || !panel) return { found: false, text: "", links: [], notice };

    const links: GeminiLink[] = [];
    const cardLinks = (scope: GeminiNode) =>
      [...scope.querySelectorAll("inline-source-card a[href]")].map((a) => ({
        url: a.href ?? "",
        title: (a.querySelector(".title")?.textContent ?? a.textContent ?? "").trim(),
      }));
    const skipped =
      "sup, button, mat-icon, gem-icon, svg, img, script, style, .cdk-visually-hidden, " +
      "[hide-from-message-actions], .hide-from-message-actions, [only-show-to-message-actions], " +
      ".code-block-decoration";
    let chip = 0;
    let out = "";
    /** Where the current list item's text starts; a first paragraph joins its marker. */
    let itemStart = -1;
    const trimLine = () => {
      out = out.replace(/[ \t]+$/, "");
    };
    const lineBreak = (indent: string) => {
      trimLine();
      if (out && !out.endsWith("\n")) out += "\n";
      if (out) out += indent;
    };
    const blankLine = () => {
      trimLine();
      if (out) out += out.endsWith("\n\n") ? "" : out.endsWith("\n") ? "\n" : "\n\n";
    };
    const write = (text: string) => {
      const collapsed = text.replace(/\s+/g, " ");
      out += /(^|[\n ])$/.test(out) || out.length === itemStart ? collapsed.trimStart() : collapsed;
    };
    const cell = (node: GeminiNode) => {
      const saved = out;
      out = "";
      walk(node, "");
      const text = out
        .replace(/\s*\n\s*/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
      out = saved;
      return text;
    };
    const walk = (node: GeminiNode, indent: string): void => {
      if (node.nodeType === 3) return write(node.nodeValue ?? "");
      if (node.nodeType !== 1) return;
      if (node.matches("source-inline-chip")) {
        const inDom = cardLinks(node);
        links.push(...(inDom.length > 0 ? inDom : (arg.chipSources[chip] ?? [])));
        chip++;
        return;
      }
      if (node.matches(skipped)) return;
      const tag = node.localName ?? node.tagName.toLowerCase();
      const children = () => {
        for (const child of node.childNodes) walk(child, indent);
      };
      if (tag === "a" && node.href)
        links.push({ url: node.href, title: (node.textContent ?? "").trim() });
      if (tag === "br") return lineBreak(indent);
      if (tag === "hr") {
        blankLine();
        out += "---";
        return blankLine();
      }
      if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "blockquote") {
        if (itemStart >= 0 && out.length === itemStart) return children();
        if (indent) lineBreak(indent);
        else blankLine();
        children();
        return indent ? undefined : blankLine();
      }
      if (tag === "ul" || tag === "ol") {
        if (indent) lineBreak("");
        else blankLine();
        let number = Number(node.getAttribute("start") ?? "1") || 1;
        for (const item of node.children) {
          if ((item.localName ?? item.tagName.toLowerCase()) !== "li") continue;
          const marker = tag === "ol" ? `${number++}.` : "-";
          lineBreak(indent);
          out += `${marker} `;
          itemStart = out.length;
          for (const child of item.childNodes)
            walk(child, `${indent}${" ".repeat(marker.length + 1)}`);
          itemStart = -1;
        }
        return indent ? undefined : blankLine();
      }
      // Step-by-step answers: the visible step titles sit in UI chrome, so read them directly.
      if (tag === "sequence") {
        blankLine();
        let number = 1;
        for (const step of node.querySelectorAll(".sequence-event")) {
          const title = step.querySelector(".sequence-event-title")?.textContent?.trim() ?? "";
          const subtitle = step.querySelector(".sequence-event-subtitle")?.textContent?.trim();
          const marker = `${number++}.`;
          lineBreak("");
          out += `${marker} `;
          write(subtitle ? `${title} (${subtitle})` : title);
          const description = step.querySelector(".sequence-event-description");
          if (description) walk(description, " ".repeat(marker.length + 1));
        }
        return blankLine();
      }
      if (tag === "table") {
        blankLine();
        for (const row of node.querySelectorAll("tr")) {
          const cells = [...row.children].filter((c) => /^t[hd]$/i.test(c.tagName));
          lineBreak("");
          out += `| ${cells.map(cell).join(" | ")} |`;
          if (cells.some((c) => /^th$/i.test(c.tagName)))
            out += `\n|${cells.map(() => " --- |").join("")}`;
        }
        return blankLine();
      }
      if (tag === "pre") {
        blankLine();
        const code = node.querySelector("code") ?? node;
        out += `\`\`\`\n${(code.textContent ?? "").replace(/\n+$/, "")}\n\`\`\``;
        return blankLine();
      }
      children();
    };
    walk(panel, "");
    for (const a of root.querySelectorAll("sources-list a[href]"))
      links.push({ url: a.href ?? "", title: (a.textContent ?? "").trim() });
    const text = out
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { found: true, text, links, notice };
  },
);
