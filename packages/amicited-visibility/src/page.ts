/**
 * In-page code is a named script: Playwright evaluates it and the extension runs its bundled
 * copy, since store policy forbids running received code. Scripts must be self-contained and
 * return JSON-serialisable data.
 */
export interface PageScript<A, R> {
  readonly name: string;
  readonly fn: (arg: A) => R | Promise<R>;
}
export interface AnyPageScript {
  readonly name: string;
  readonly fn: (arg: never) => unknown;
}

const registry = new Map<string, AnyPageScript>();
export function pageScript<A, R>(name: string, fn: (arg: A) => R | Promise<R>): PageScript<A, R> {
  if (registry.has(name)) throw new Error(`Page script "${name}" is already registered.`);
  const script = { name, fn };
  registry.set(name, script);
  return script;
}
/** Every registered script. The extension bundles all engines, so it can run any of them. */
export function pageScripts(): ReadonlyMap<string, AnyPageScript> {
  return registry;
}

export type PageDriver = "extension" | "managed" | "fake";
export interface EnginePage {
  readonly driver: PageDriver;
  /** The browser behind the page, for people: "Firefox 156" or "AmICited browser". */
  readonly browser: string;
  /** Navigates and resolves once the DOM is parsed. */
  goto(url: string, options?: { readonly timeoutMs?: number }): Promise<void>;
  run<A, R>(script: PageScript<A, R>, arg: A): Promise<R>;
  /** Focuses the first match, clears it and enters text the way the driver can best imitate typing. */
  type(selector: string, text: string): Promise<void>;
  press(selector: string, key: "Enter"): Promise<void>;
  click(selector: string): Promise<void>;
  close(): Promise<void>;
  isClosed(): boolean;
}

/**
 * The slice of the DOM page scripts use. The server type-checks scripts without DOM types,
 * so a script reaches the page with `const w = globalThis as unknown as PageWindow;`.
 * Extend these types when a script needs more.
 */
export interface PageNode {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly innerText?: string;
  readonly href?: string;
  readonly isContentEditable?: boolean;
  readonly children: ArrayLike<PageNode>;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { readonly width: number; readonly height: number };
  querySelector(selector: string): PageNode | null;
  querySelectorAll(selector: string): ArrayLike<PageNode> & Iterable<PageNode>;
  closest(selector: string): PageNode | null;
  focus(): void;
  click(): void;
  select?(): void;
  dispatchEvent(event: unknown): boolean;
}
export interface PageWindow {
  readonly document: PageNode & {
    readonly title: string;
    execCommand(command: string, showUi: boolean, value: string): boolean;
    createRange(): { selectNodeContents(node: PageNode): void };
  };
  readonly location: { readonly href: string };
  getComputedStyle(node: PageNode): { readonly visibility: string; readonly display: string };
  getSelection(): { removeAllRanges(): void; addRange(range: unknown): void } | null;
  readonly InputEvent: new (type: string, init: object) => unknown;
  readonly KeyboardEvent: new (type: string, init: object) => unknown;
}

export interface PageState {
  readonly url: string;
  readonly title: string;
  readonly visible: readonly boolean[];
}
/** Reports whether any match of each selector is visible, plus the page URL and title. */
export const inspect = pageScript(
  "inspect",
  (arg: { readonly selectors: readonly string[] }): PageState => {
    const w = globalThis as unknown as PageWindow;
    const shown = (node: PageNode) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && w.getComputedStyle(node).visibility !== "hidden";
    };
    return {
      url: w.location.href,
      title: w.document.title,
      visible: arg.selectors.map((selector) => {
        try {
          return [...w.document.querySelectorAll(selector)].some(shown);
        } catch {
          return false;
        }
      }),
    };
  },
);

export interface AnswerSnapshot {
  readonly found: boolean;
  readonly busy: boolean;
  readonly text: string;
  readonly links: readonly { readonly url: string; readonly title: string }[];
}
/** Reads the first or last match of an answer container, its links, and whether a busy marker shows. */
export const readAnswer = pageScript(
  "readAnswer",
  (arg: {
    readonly selector: string;
    readonly which: "first" | "last";
    readonly busy?: string | undefined;
  }): AnswerSnapshot => {
    const w = globalThis as unknown as PageWindow;
    const all = [...w.document.querySelectorAll(arg.selector)];
    const node = arg.which === "first" ? all[0] : all.at(-1);
    let busy = false;
    if (arg.busy)
      try {
        busy = [...w.document.querySelectorAll(arg.busy)].some((n) => {
          const box = n.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        });
      } catch {
        busy = false;
      }
    if (!node) return { found: false, busy, text: "", links: [] };
    return {
      found: true,
      busy,
      text: node.innerText ?? node.textContent ?? "",
      links: [...node.querySelectorAll("a[href]")].map((a) => ({
        url: a.href ?? "",
        title: (a.textContent ?? "").trim(),
      })),
    };
  },
);

/** Enters text through the browser's editing commands so editors see trusted input events. */
export const insertText = pageScript(
  "insertText",
  (arg: { readonly selector: string; readonly text: string }) => {
    const w = globalThis as unknown as PageWindow;
    const node = w.document.querySelector(arg.selector);
    if (!node) throw new Error(`Input not found: ${arg.selector}`);
    node.focus();
    const field = !node.isContentEditable && "value" in node;
    if (field) node.select?.();
    else {
      const range = w.document.createRange();
      range.selectNodeContents(node);
      const selection = w.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (w.document.execCommand("insertText", false, arg.text)) return true;
    if (field) {
      const prototype = Object.getPrototypeOf(node) as object;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(node, arg.text);
    } else Object.assign(node, { textContent: arg.text });
    node.dispatchEvent(new w.InputEvent("input", { bubbles: true, data: arg.text }));
    return true;
  },
);

export const pressKey = pageScript(
  "pressKey",
  (arg: { readonly selector: string; readonly key: "Enter" }) => {
    const w = globalThis as unknown as PageWindow;
    const node = w.document.querySelector(arg.selector);
    if (!node) throw new Error(`Element not found: ${arg.selector}`);
    node.focus();
    const init = { key: arg.key, code: arg.key, keyCode: 13, which: 13, bubbles: true };
    for (const type of ["keydown", "keypress", "keyup"])
      node.dispatchEvent(new w.KeyboardEvent(type, init));
    return true;
  },
);

export const clickElement = pageScript("clickElement", (arg: { readonly selector: string }) => {
  const node = (globalThis as unknown as PageWindow).document.querySelector(arg.selector);
  if (!node) throw new Error(`Element not found: ${arg.selector}`);
  node.click();
  return true;
});
