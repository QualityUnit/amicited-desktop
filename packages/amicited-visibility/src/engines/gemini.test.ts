/// <reference lib="dom" />
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";
import { GeminiEngine } from "./gemini.ts";
import { openGeminiSources, type GeminiLink } from "./gemini.scripts.ts";

// Fixtures are real signed-out Gemini answers (the `model-response` element) as XHTML, with
// tracking attributes stripped. XHTML keeps Angular's <div>-inside-<p> nesting, which an HTML
// parser would rearrange. `<name>.sources.json` holds what each citation chip's popover listed.
const fixtureFile = (file: string) =>
  NodePath.join(import.meta.dirname, "fixtures", "gemini", file);
const fixture = (name: string) => ({
  xhtml: NodeFS.readFileSync(fixtureFile(`${name}.xhtml`), "utf8"),
  sources: NodeFS.existsSync(fixtureFile(`${name}.sources.json`))
    ? (JSON.parse(
        NodeFS.readFileSync(fixtureFile(`${name}.sources.json`), "utf8"),
      ) as GeminiLink[][])
    : [],
});

const context = (): EngineContext => {
  let now = Date.parse("2026-11-19T09:00:00Z");
  return {
    signal: new AbortController().signal,
    now: () => new Date(now),
    sleep: async (ms) => {
      now += ms;
    },
    random: () => 0.5,
  };
};

/**
 * Stands in for gemini.google.com: a prompt box, a consent dialog, and an answer that appears
 * on send. Citation chips open their source cards on Enter and close them on Escape, as on
 * the real page, except for chips listed in `stuck`.
 */
function geminiPage(name: string, options: { readonly stuck?: readonly number[] } = {}) {
  const { xhtml, sources } = fixture(name);
  document.body.innerHTML = `
    <button data-test-id="reject-button">Reject all</button>
    <rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>
    <div data-test-id="send-button-container"><div class="send-button"><button>Send</button></div></div>
    <main></main>`;
  const main = document.querySelector("main")!;
  const reject = document.querySelector('[data-test-id="reject-button"]')!;
  reject.addEventListener("click", () => reject.remove());
  document
    .querySelector('[data-test-id="send-button-container"] button')!
    .addEventListener("click", () => {
      const answer = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");
      main.replaceChildren(document.importNode(answer.documentElement, true));
    });
  main.addEventListener("keydown", (event: KeyboardEvent) => {
    const chip = (event.target as Element).closest("source-inline-chip");
    if (!chip) return;
    const index = [...document.querySelectorAll("source-inline-chip")].indexOf(chip);
    if (event.key === "Escape") chip.querySelector("[popover]")?.remove();
    if (event.key !== "Enter" || options.stuck?.includes(index)) return;
    const cards = (sources[index] ?? [])
      .map(
        (s) =>
          `<inline-source-card><a href="${s.url}"><div class="title">${s.title}</div></a></inline-source-card>`,
      )
      .join("");
    chip.insertAdjacentHTML("beforeend", `<div popover="manual">${cards}</div>`);
  });
  const page: EnginePage = {
    driver: "fake",
    browser: "jsdom",
    goto: async () => {},
    run: async (script, arg) => script.fn(arg),
    type: async (selector, text) => {
      document.querySelector(selector)!.textContent = text;
    },
    press: async () => {},
    click: async (selector) => {
      (document.querySelector(selector) as HTMLElement).click();
    },
    close: async () => {},
    isClosed: () => false,
  };
  return { page, sources, consentAnswered: () => !document.contains(reject) };
}

const ask = async (name: string, prompt: string, brand: string, domain: string) => {
  // jsdom lays nothing out; give every element a box so visibility checks pass.
  using _layout = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({ width: 10, height: 10 } as DOMRect);
  const site = geminiPage(name);
  const result = await new GeminiEngine().run(
    site.page,
    { prompt, brand, domain, country: "SK" },
    context(),
  );
  return { ...site, result };
};

describe("Gemini", () => {
  it("reads a table answer and the sources behind its citation chips, in order", async () => {
    const { result, sources, consentAnswered } = await ask(
      "table",
      "What are the best project management tools for small teams? Include a comparison table.",
      "Asana",
      "asana.com",
    );
    expect(consentAnswered()).toBe(true);
    expect(result).toMatchObject({ status: "answered", reason: null });
    expect(result.text).toMatch(/^Choosing the right project management tool/);
    expect(result.text).toContain("\n2. Asana — Best for Task Management & Team Collaboration\n");
    expect(result.text).toContain(
      "| Tool | Best For | Standout Views | Free Tier? | Starting Paid Price (Approx.) |\n| --- | --- | --- | --- | --- |\n| Trello |",
    );
    expect(result.text).not.toMatch(/Gemini said|Flowii|Plaky/);
    expect(result.sources.map((s) => s.url)).toEqual(
      sources.flat().map((s) => s.url.replace(/#:~:.*/, "")),
    );
    expect(result.sources[0]).toMatchObject({ position: 1, domain: "flowii.com" });
    expect(result.brand).toMatchObject({ mentioned: true, listPosition: 2 });
    expect(result.competitors).toEqual(["Trello", "ClickUp", "monday.com", "Basecamp"]);
  });

  it("keeps list structure, drops repeated chips' duplicate sources, and finds the brand", async () => {
    const { result } = await ask(
      "multi-chip",
      "What are the best email marketing platforms for ecommerce brands?",
      "Klaviyo",
      "klaviyo.com",
    );
    expect(result.text).toContain("\n- Key Strengths: Unmatched data segmentation");
    expect(result.sources.map((s) => [s.position, s.domain])).toEqual([
      [1, "sender.net"],
      [2, "ventureharbour.com"],
    ]);
    expect(result.brand).toMatchObject({ mentioned: true, listPosition: 1 });
    expect(result.competitors).not.toContain("Key Strengths");
  });

  it("renders step-by-step answers as a numbered list with fenced code", async () => {
    const { result } = await ask(
      "steps",
      "How do I create and activate a Python virtual environment on Linux?",
      "Python",
      "python.org",
    );
    expect(result.text).toContain(
      "\n1. Install the venv package (Required for Ubuntu, Debian, and Linux Mint users)\n",
    );
    expect(result.text).toContain("```\nsudo apt update && sudo apt install python3-venv\n```");
    expect(result.text).toContain("\n4. Activate the virtual environment\n");
    expect(result.text).not.toMatch(/1\.Install|Bash|Download code/);
  });

  it("reports Gemini's own error reply as a failure, not an answer", async () => {
    const { result } = await ask("error", "Which CRM is best?", "HubSpot", "hubspot.com");
    expect(result).toMatchObject({
      status: "failed",
      reason:
        "Gemini did not answer: I encountered an error doing what you asked. Could you try again?",
      text: "",
    });
  });

  it("gives up on a chip whose sources never open and reads the rest", async () => {
    const { page, sources } = geminiPage("table", { stuck: [0] });
    document.querySelector<HTMLElement>('[data-test-id="send-button-container"] button')!.click();
    expect(await page.run(openGeminiSources, { openMs: 0 })).toEqual([[], sources[1]]);
  });
});
