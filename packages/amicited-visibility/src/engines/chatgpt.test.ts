import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EngineContext } from "../engine.ts";
import type { EnginePage, PageScript } from "../page.ts";
import { answeredResult } from "../result.ts";
import { ChatGptEngine, chatgptAnswer, cleanUrl } from "./chatgpt.ts";
import { chatgptCitations, chatgptRead, chatgptStatus } from "./chatgpt.scripts.ts";

// Signed-out answers saved from chatgpt.com (classes, icons and ids stripped).
const fixture = (name: string) =>
  NodeFS.readFileSync(NodePath.join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");
// The package type-checks without DOM types; the test environment provides jsdom.
const dom = globalThis as unknown as {
  document: { body: { innerHTML: string } };
  Element: { prototype: { getBoundingClientRect(): unknown } };
};
const show = (html: string) => {
  dom.document.body.innerHTML = html;
};
const base = {
  engine: "chatgpt" as const,
  prompt: "Best tools?",
  capturedAt: "2026-11-19T09:00:00.000Z",
  country: "SK",
};

/** Runs page scripts against whatever `document` holds, as the extension would in a tab. */
function domPage(html: string): EnginePage & { log: string[] } {
  const log: string[] = [];
  return {
    driver: "fake",
    browser: "jsdom",
    log,
    goto: async (url) => {
      log.push(`goto ${url}`);
      show(html);
    },
    run: <A, R>(script: PageScript<A, R>, arg: A) => Promise.resolve(script.fn(arg)),
    type: async (selector, text) => {
      log.push(`type ${selector} ${text}`);
    },
    press: async () => {},
    click: async (selector) => {
      log.push(`click ${selector}`);
    },
    close: async () => {},
    isClosed: () => false,
  };
}
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

describe("ChatGPT page scripts", () => {
  it("read a searched answer with its tables, lists and inline citations", async () => {
    show(fixture("chatgpt-search"));
    expect(await chatgptStatus.fn({})).toMatchObject({
      ui: "octane",
      sent: true,
      found: true,
      complete: true,
      notice: null,
    });
    const read = await chatgptRead.fn({});
    expect(read.text).toContain(
      "- HubSpot CRM – Best overall.\n- Zoho CRM – Best value for money.",
    );
    expect(read.text).toContain("CRM software | Best for | Starting price* | Free plan");
    expect(read.text).toContain("Zoho CRM | Affordability and features | $14/user/month | Yes");
    expect(read.text).toContain("1. HubSpot CRM – Best overall");
    // Citation pills are sources, not answer text.
    expect(read.text).not.toMatch(/PLYNTUM|\+2|Copy table|https?:/);
    expect(read).toMatchObject({ citations: 2, sourcesButton: true });

    const answer = chatgptAnswer(read, [], false);
    expect(answer.webSearch).toBe(true);
    expect(answer.links.slice(0, 4)).toEqual([
      { url: "https://plyntum.com/en/guide/best-crm-small-business/", title: "plyntum.com" },
      { url: "https://www.techradar.com/best/best-crm-for-small-business", title: "techradar.com" },
      {
        url: "https://toolsandthrive.com/best-crm-for-small-business/",
        title: "toolsandthrive.com",
      },
      { url: "https://www.hubspot.com/", title: "HubSpot official website" },
    ]);
    const result = answeredResult(base, answer, {
      brand: "Zoho CRM",
      domain: "zoho.com",
      competitors: ["HubSpot", "Monday.com"],
    });
    expect(result.brand).toMatchObject({ mentioned: true, listPosition: 2 });
    expect(result.domain.mentioned).toBe(false);
    expect(result.domain.citedAt).toEqual([5]);
    expect(result.sources[4]).toMatchObject({
      domain: "zoho.com",
      url: "https://www.zoho.com/crm/",
    });
    expect(result.competitors).toContain("HubSpot");
    expect(result.webSearch).toBe(true);
  });

  it("tell an answer without web search from one with it", async () => {
    show(fixture("chatgpt-no-search"));
    const read = await chatgptRead.fn({});
    expect(read).toMatchObject({ citations: 0, sourcesButton: false });
    const answer = chatgptAnswer(read, [], false);
    expect(answer.webSearch).toBe(false);
    expect(answer.links.map((l) => l.url)).toEqual([
      "https://asana.com/",
      "https://clickup.com/",
      "https://monday.com/",
      "https://trello.com/",
      "https://www.atlassian.com/software/jira",
      "https://www.notion.com/",
    ]);
    const result = answeredResult(base, answer, { brand: "monday.com", domain: "monday.com" });
    expect(result.brand.mentioned && result.domain.mentioned).toBe(true);
    expect(result.domain.citedAt).toEqual([3]);
    expect(chatgptAnswer(read, [], true).webSearch).toBe(true);
  });

  it("take source titles from the open Sources panel", async () => {
    show(fixture("chatgpt-sources-open"));
    const citations = await chatgptCitations.fn({ waitMs: 0 });
    expect(citations[0]).toEqual({
      url: "https://technologyadvice.com/marketing/ecommerce-email-marketing-software/?utm_source=chatgpt.com",
      title: "Best Ecommerce Email Marketing Software (2026)",
      publisher: "TechnologyAdvice",
    });
    const answer = chatgptAnswer(await chatgptRead.fn({}), citations, false);
    expect(answer.links[0]).toEqual({
      url: "https://technologyadvice.com/marketing/ecommerce-email-marketing-software/",
      title: "Best Ecommerce Email Marketing Software (2026)",
    });
    expect(answer.links.every((l) => !l.url.includes("utm_"))).toBe(true);
  });

  it("read the signed-in app's markup, whose citation pills are links", async () => {
    // Reconstructed from the signed-in React app's markup; not a saved page.
    show(`<main><article data-testid="conversation-turn-1"><div data-message-author-role="user">Best CRM?</div></article>
      <article data-testid="conversation-turn-2"><div data-message-author-role="assistant"><div class="markdown prose">
      <ol><li><p><strong>Northwind</strong> is simple.<span data-state="closed"><a href="https://review.example/crm?utm_source=chatgpt.com" target="_blank">review +1</a></span></p></li><li><p>Acme</p></li></ol>
      </div></div><button aria-label="Sources">Sources</button></article>
      <section data-testid="screen-threadFlyOut"><h2>Citations</h2><a href="https://review.example/crm?utm_source=chatgpt.com"><div class="line-clamp-2">Best CRM, reviewed</div></a><a href="https://other.example/list"><div class="line-clamp-2">Another list</div></a></section></main>`);
    expect(await chatgptStatus.fn({})).toMatchObject({ ui: "classic", sent: true, complete: true });
    const read = await chatgptRead.fn({});
    expect(read.text).toBe("1. Northwind is simple.\n2. Acme");
    const answer = chatgptAnswer(read, await chatgptCitations.fn({ waitMs: 0 }), false);
    expect(answer).toMatchObject({
      webSearch: true,
      links: [
        { url: "https://review.example/crm", title: "Best CRM, reviewed" },
        { url: "https://other.example/list", title: "Another list" },
      ],
    });
  });

  it("normalise ChatGPT's tracking parameters only", async () => {
    expect(cleanUrl("https://a.example/x?utm_source=chatgpt.com")).toBe("https://a.example/x");
    expect(cleanUrl("https://a.example/x?id=2&utm_medium=ai#top")).toBe(
      "https://a.example/x?id=2#top",
    );
  });
});

describe("ChatGPT engine", () => {
  const engine = new ChatGptEngine();
  const query = { prompt: "Best tools?", brand: "Asana", domain: "asana.com", country: "SK" };

  it("sends the prompt in a temporary chat URL and returns the answer", async () => {
    const page = domPage(fixture("chatgpt-no-search"));
    const result = await engine.run(page, query, context());
    expect(page.log).toEqual(["goto https://chatgpt.com/?temporary-chat=true&q=Best+tools%3F"]);
    expect(result).toMatchObject({ status: "answered", webSearch: false });
    expect(result.brand.listPosition).toBe(1);
    expect(result.domain.citedAt).toEqual([1]);
  });

  it("types prompts too long for the URL", async () => {
    // jsdom has no layout, and typing waits for a visible prompt box.
    using _layout = vi
      .spyOn(dom.Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 100, height: 20 });
    const composer = '<form data-mobile-composer><textarea name="prompt"></textarea></form>';
    const page = domPage(fixture("chatgpt-no-search") + composer);
    const prompt = "x".repeat(2_000);
    await engine.run(page, { ...query, prompt }, context());
    expect(page.log.slice(0, 2)).toEqual([
      "goto https://chatgpt.com/?temporary-chat=true",
      `type #prompt-textarea, textarea[name="prompt"] ${prompt}`,
    ]);
  });

  it("reports limits and sign-in walls instead of waiting them out", async () => {
    const asked = '<main><ol><li data-message-role="user">Best CRM?</li></ol>';
    const limited = await engine.run(
      domPage(
        `${asked}<p>You’ve reached our limit of messages per hour. Please try again later.</p></main>`,
      ),
      query,
      context(),
    );
    expect(limited).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("reached our limit of messages per hour"),
    });
    const wall = await engine.run(
      domPage(`${asked}</main><dialog id="mobile-auth-dialog" open>Log in or sign up</dialog>`),
      query,
      context(),
    );
    expect(wall).toMatchObject({ status: "logged_out" });
  });
});
