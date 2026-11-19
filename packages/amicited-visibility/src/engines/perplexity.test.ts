// @effect-diagnostics nodeBuiltinImport:off - Tests read saved page fixtures.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { EngineContext } from "../engine.ts";
import type { EnginePage, PageScript, PageState } from "../page.ts";
import answerThread from "./fixtures/perplexity-answer.thread.json" with { type: "json" };
import wallThread from "./fixtures/perplexity-wall.thread.json" with { type: "json" };
import {
  PerplexityEngine,
  isSignUpWall,
  perplexityAnswer,
  stripCitationMarkers,
} from "./perplexity.ts";
import { readPerplexityAnswer, type PerplexityPageAnswer } from "./perplexity.scripts.ts";

// Captured signed out on 2026-11-19, when Perplexity answered with its sign-up gate.
const wall: PerplexityPageAnswer["thread"] = wallThread;
// A finished answer in the shape of the thread API, with the sources the page lists.
const answeredThread: PerplexityPageAnswer["thread"] = answerThread;

const page = (name: string) =>
  NodeFS.readFileSync(NodePath.join(import.meta.dirname, "fixtures", name), "utf8");
// The package type-checks without DOM types; the test environment provides jsdom.
const dom = globalThis as unknown as { document: { body: { innerHTML: string } } };

/** Runs the page script the way the extension does: serialised, with only the page's globals. */
async function readPage(html: string) {
  dom.document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1]!;
  const run = new Function(`return (${readPerplexityAnswer.fn.toString()})`)() as (
    arg: null,
  ) => Promise<PerplexityPageAnswer>;
  return (await run(null)).page;
}

describe("reading Perplexity's page", () => {
  // Captured signed out on 2026-11-19: Perplexity answered with its sign-up gate.
  it("reads the sign-up wall a signed-out ask gets", async () => {
    expect(await readPage(page("perplexity-wall.html"))).toMatchObject({
      text: "Sign up and repeat your request.",
      links: [],
      finished: true,
      gated: true,
    });
  });

  // The captured page's wrappers around answer markup in the shape Perplexity's renderer emits.
  it("reads the whole answer as Markdown-like text and every citation chip in order", async () => {
    const answer = await readPage(page("perplexity-answer.html"));
    expect(answer.text).toBe(
      [
        "For most small businesses the strongest options are HubSpot CRM, Zoho CRM, Pipedrive and Salesforce Starter.",
        "## Top picks",
        "1. HubSpot CRM – a free core CRM with marketing tools built in",
        "2. Zoho CRM – low price per seat and deep customisation",
        "3. Pipedrive – a visual sales pipeline",
        "  - Drag-and-drop deals",
        "  - Workflow automation",
        "| Tool | Starting price |",
        "| HubSpot CRM | Free |",
        "| Zoho CRM | $14 per user |",
        "Compare current plans on Pipedrive's pricing page before you choose.",
      ].join("\n"),
    );
    expect([...new Set(answer.links.map((l) => l.url))]).toEqual([
      "https://www.g2.com/categories/crm",
      "https://www.hubspot.com/products/crm",
      "https://www.zoho.com/crm/",
      "https://www.pipedrive.com/en/features",
      "https://www.hubspot.com/pricing/crm",
      "https://www.pipedrive.com/en/pricing",
    ]);
    expect(answer.links.at(-1)).toEqual({
      url: "https://www.pipedrive.com/en/pricing",
      title: "Pipedrive's pricing page",
    });
    expect(answer).toMatchObject({ finished: true, gated: false });
  });
});

describe("Perplexity answers", () => {
  const page = { text: "", links: [], finished: false, busy: false, gated: false };

  it("prefers the thread's Markdown and sources, keeping page-only links after them", () => {
    const answer = perplexityAnswer({
      url: "",
      thread: answeredThread,
      page: { ...page, links: [{ url: "https://www.pipedrive.com/en/pricing", title: "Pricing" }] },
    });
    expect(answer.text).toBe(
      [
        "For most small businesses the strongest options are **HubSpot CRM**, Zoho CRM, Pipedrive and Salesforce Starter.",
        "",
        "## Top picks",
        "",
        "1. **HubSpot CRM** – a free core CRM with marketing tools built in",
        "2. **Zoho CRM** – low price per seat and deep customisation",
        "3. **Pipedrive** – a visual sales pipeline",
        "",
        "| Tool | Starting price |",
        "| --- | --- |",
        "| HubSpot CRM | Free |",
        "| Zoho CRM | $14 per user |",
      ].join("\n"),
    );
    expect(answer.links.map((l) => l.url)).toEqual([
      "https://www.g2.com/categories/crm",
      "https://www.hubspot.com/products/crm",
      "https://zapier.com/blog/best-crm-app/",
      "https://www.zoho.com/crm/",
      "https://www.pipedrive.com/en/features",
      "https://www.pipedrive.com/en/pricing",
    ]);
    expect(answer.links[0]!.title).toBe("Best CRM Software: User Reviews from 2026");
    expect(answer).toMatchObject({ finished: true, signInWall: false, via: "thread" });
  });

  it("waits while the thread streams and falls back to the page without one", () => {
    const streaming = {
      entries: [
        {
          status: "IN_PROGRESS",
          blocks: [
            {
              intended_usage: "ask_text",
              markdown_block: { progress: "IN_PROGRESS", chunks: ["Hub", "Spot"] },
            },
          ],
        },
      ],
    };
    expect(perplexityAnswer({ url: "", thread: streaming, page })).toMatchObject({
      text: "HubSpot",
      finished: false,
    });
    expect(
      perplexityAnswer({
        url: "",
        thread: null,
        page: { ...page, text: "Answer", finished: true, busy: true },
      }),
    ).toMatchObject({ text: "Answer", finished: false, via: "page" });
  });

  it.each([
    ["Sign up and repeat your request.", true],
    ["Please sign in to continue.", true],
    ["Log in to continue your request", true],
    ["Sign up for HubSpot to repeat the steps below. ".repeat(6), false],
    ["HubSpot asks you to sign up and repeat your request.", false],
  ])("treats %j as the sign-up wall: %s", (text, wall) => {
    expect(isSignUpWall(text)).toBe(wall);
  });

  it("strips citation markers but keeps real links", () => {
    expect(
      stripCitationMarkers("A [1][2], B[web:3] and [C](https://c.io)[4](https://x.io) ."),
    ).toBe("A, B and [C](https://c.io).");
  });
});

describe("Perplexity runs", () => {
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
  /** A page that answers Perplexity's scripts from a list of successive reads. */
  const scripted = (session: string | null, reads: PerplexityPageAnswer[]) => {
    let url = "about:blank";
    let sent = false;
    const log: string[] = [];
    const page: EnginePage = {
      driver: "fake",
      browser: "Test page",
      goto: async (next) => void (url = next),
      async run<A, R>(script: PageScript<A, R>, arg: A): Promise<R> {
        log.push(script.name);
        if (script.name === "inspect") {
          const { input, submit } = new PerplexityEngine().selectors;
          const { selectors } = arg as { selectors: readonly string[] };
          const visible = selectors.map((s) => s === input || s === submit);
          return { url, title: "Perplexity", visible } satisfies PageState as R;
        }
        if (script.name === "perplexitySession") return session as R;
        if (script.name === "readPerplexityAnswer")
          return (reads.length > 1 ? reads.shift() : reads[0]) as R;
        return [] as R;
      },
      type: async () => {},
      press: async () => {},
      click: async () => {
        if (!sent) url = "https://www.perplexity.ai/search/best-crm-abc";
        sent = true;
      },
      close: async () => {},
      isClosed: () => false,
    };
    return { page, log };
  };
  const query = {
    prompt: "What are the best CRM tools for small businesses?",
    brand: "HubSpot",
    domain: "hubspot.com",
    competitors: ["Zoho CRM"],
    country: "SK",
  };
  const read = (answer: PerplexityPageAnswer["thread"]): PerplexityPageAnswer => ({
    url: "https://www.perplexity.ai/search/best-crm-abc",
    thread: answer,
    page: { text: "", links: [], finished: false, busy: false, gated: false },
  });

  it("captures a finished answer with its sources and finds the brand", async () => {
    const done = answeredThread;
    const streaming = {
      entries: [
        {
          status: "IN_PROGRESS",
          blocks: [{ intended_usage: "ask_text", markdown_block: { chunks: ["For most"] } }],
        },
      ],
    };
    const { page } = scripted("signed_in", [read(null), read(streaming), read(done)]);
    const result = await new PerplexityEngine().run(page, query, context());
    expect(result).toMatchObject({
      status: "answered",
      session: "logged_in",
      brand: { mentioned: true, listPosition: 1 },
      domain: { mentioned: false, citedAt: [2] },
      competitors: ["Zoho CRM", "Pipedrive"],
    });
    expect(result.text.length).toBeGreaterThan(300);
    expect(result.sources.map((s) => s.domain)).toEqual([
      "g2.com",
      "hubspot.com",
      "zapier.com",
      "zoho.com",
      "pipedrive.com",
    ]);
  });

  it("reports a signed-out browser and the sign-up wall as needing sign-in, and an empty answer as failed", async () => {
    const signedOut = scripted("signed_out", [read(null)]);
    expect(await new PerplexityEngine().run(signedOut.page, query, context())).toMatchObject({
      status: "logged_out",
      session: "logged_out",
    });
    expect(signedOut.log).not.toContain("readPerplexityAnswer");

    const walled = scripted(null, [read(wall)]);
    expect(await new PerplexityEngine().run(walled.page, query, context())).toMatchObject({
      status: "logged_out",
      reason: "Perplexity asks you to sign in before it answers.",
      text: "",
    });

    const empty = scripted("signed_in", [read({ entries: [{ status: "FAILED", blocks: [] }] })]);
    expect(await new PerplexityEngine().run(empty.page, query, context())).toMatchObject({
      status: "failed",
      reason: "Perplexity finished without an answer.",
    });
  });
});
