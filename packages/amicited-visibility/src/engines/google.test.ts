/// <reference lib="dom" />
import { expect, it, vi } from "vite-plus/test";
import type { EnginePage } from "../page.ts";
import { GoogleAiModeEngine } from "./google.ts";

/** AI Mode as an unconsented visitor sees it: the cookie dialog over a nameless prompt box. */
const aiModePage = (): EnginePage => {
  document.body.innerHTML = `
    <div role="dialog"><button id="W0wltc">Reject all</button></div>
    <div data-xid="aim-zero-state-input-plate"><textarea aria-label="Ask anything"></textarea></div>
    <main></main>`;
  const dialog = document.querySelector('[role="dialog"]')!;
  document.querySelector("#W0wltc")!.addEventListener("click", () => dialog.remove());
  const blocked = () => document.contains(dialog);
  const answer = () => {
    if (blocked()) return;
    document.querySelector("main")!.innerHTML =
      `<div data-container-id="main-col"><p>[Highlight start]</p><p>Profound and Peec AI track brands in AI answers.</p><p>[Highlight end]</p>` +
      `<a href="https://tryprofound.com/">Profound</a><a href="https://policies.google.com/privacy">privacy policy</a></div>`;
  };
  return {
    driver: "fake",
    browser: "jsdom",
    goto: async () => {},
    run: async (script, arg) => script.fn(arg),
    type: async (selector, text) => {
      if (!blocked()) document.querySelector<HTMLTextAreaElement>(selector)!.value = text;
    },
    press: async (_selector, key) => {
      if (key === "Enter") answer();
    },
    click: async () => {},
    close: async () => {},
    isClosed: () => false,
  };
};

it("rejects Google's cookie dialog, asks in AI Mode's prompt box, and drops Google's own furniture", async () => {
  // jsdom lays nothing out; give every element a box so visibility checks pass.
  using _layout = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({ width: 10, height: 10 } as DOMRect);
  let now = Date.parse("2026-11-23T09:00:00Z");
  const result = await new GoogleAiModeEngine().run(
    aiModePage(),
    {
      prompt: "Best AI visibility tools?",
      brand: "Profound",
      domain: "tryprofound.com",
      country: "SK",
    },
    {
      signal: new AbortController().signal,
      now: () => new Date(now),
      sleep: async (ms) => {
        now += ms;
      },
      random: () => 0.5,
    },
  );
  expect(result).toMatchObject({ status: "answered", reason: null });
  expect(result.text).toContain("Profound and Peec AI");
  expect(result.text).not.toContain("Highlight");
  expect(result.sources.map((s) => s.url)).toEqual(["https://tryprofound.com/"]);
});
