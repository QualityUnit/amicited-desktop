import { describe, expect, it, vi } from "vite-plus/test";
import type { EngineContext } from "../engine.ts";
import type { EnginePage, PageScript } from "../page.ts";
import { answeredResult } from "../result.ts";
import { ChatGptEngine, chatgptAnswer, cleanUrl } from "./chatgpt.ts";
import { chatgptCitations, chatgptRead, chatgptStatus } from "./chatgpt.scripts.ts";

// Trimmed from signed-out chatgpt.com answers: the markup the scripts rely on, nothing else.
const markdown = [
  "For most small businesses:",
  "- **HubSpot CRM** – Best overall.\n- **Zoho CRM** – Best value.",
  "Prices vary. ([techradar.com](https://www.techradar.com/best/crm?utm_source=chatgpt.com), [g2.com](https://www.g2.com/categories/crm?utm_source=chatgpt.com))",
  "### 1. Zoho CRM – Best value",
  "[Zoho CRM official website](https://www.zoho.com/crm/?utm_source=chatgpt.com)",
].join("\n\n");
const state = JSON.stringify({
  messages: [
    { id: "u1", role: "user", content: "Best CRM tools?" },
    { id: "a1", role: "assistant", content: markdown },
  ],
}).replaceAll('"', "&quot;");
const searched = `<main><ol data-conversation-transcript>
<li data-message-role="user" id="u1"><p>Best CRM tools?</p></li>
<li data-message-role="assistant" id="a1" data-message-complete><div data-assistant-markdown-root><div aria-busy="false">
<p>For most small businesses:</p>
<ul><li><strong>HubSpot CRM</strong> – Best overall.</li><li><strong>Zoho CRM</strong> – Best value.</li></ul>
<div><span data-message-content-controls><button aria-label="Copy table"></button></span><div><table>
<thead><tr><th>CRM</th><th>Price</th></tr></thead>
<tbody><tr><td>HubSpot</td><td>Free</td></tr><tr><td>Zoho CRM</td><td>$14/user/month</td></tr></tbody></table></div></div>
<p>Prices vary. <span role="group" aria-label="Sources"><button aria-haspopup="dialog" aria-label="TechRadar, 2 sources"><span>TechRadar</span><span>+1</span></button></span></p>
<h3>1. <button aria-haspopup="dialog">Zoho CRM</button> – Best value</h3>
<p><a href="https://www.zoho.com/crm/?utm_source=chatgpt.com">Zoho CRM official website</a></p>
</div></div>
<div data-assistant-message-actions role="group"><button aria-label="Copy response"></button><button aria-haspopup="dialog">Sources</button></div>
</li></ol></main>
<dialog id="assistant-sources-dialog" open><article data-assistant-sources-dialog><h2>Sources</h2><ol><li>
<a href="https://www.techradar.com/best/crm?utm_source=chatgpt.com"><span><span><span>TechRadar</span></span><strong>Best CRM of 2026 | TechRadar</strong></span></a>
</li></ol></article></dialog>
<input name="conversationState" type="hidden" value="${state}">`;
const unsearched = `<main><ol data-conversation-transcript>
<li data-message-role="user" id="u1"><p>Best tools?</p></li>
<li data-message-role="assistant" id="a1" data-message-complete><div data-assistant-markdown-root>
<ol><li><strong>Asana</strong> – Best overall</li><li><strong>ClickUp</strong> – All in one</li></ol>
<p><a href="https://asana.com/?utm_source=chatgpt.com">Asana official website</a></p>
<p><a href="https://clickup.com/?utm_source=chatgpt.com">ClickUp official website</a></p>
</div><div data-assistant-message-actions role="group"><button aria-label="Copy response"></button></div>
</li></ol></main>`;
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
  it("read a searched answer, its citations in answer order and their titles", async () => {
    show(searched);
    expect(await chatgptStatus.fn({})).toMatchObject({
      ui: "octane",
      sent: true,
      found: true,
      complete: true,
      notice: null,
    });
    const read = await chatgptRead.fn({});
    // Lists and tables stay readable; citation pills and controls are not answer text.
    expect(read.text).toBe(
      [
        "For most small businesses:",
        "- HubSpot CRM – Best overall.\n- Zoho CRM – Best value.",
        "CRM | Price\nHubSpot | Free\nZoho CRM | $14/user/month",
        "Prices vary.",
        "1. Zoho CRM – Best value",
        "Zoho CRM official website",
      ].join("\n\n"),
    );
    expect(read).toMatchObject({ citations: 1, sourcesButton: true });

    const answer = chatgptAnswer(read, await chatgptCitations.fn({ waitMs: 0 }), false);
    expect(answer).toEqual({
      text: read.text,
      webSearch: true,
      links: [
        { url: "https://www.techradar.com/best/crm", title: "Best CRM of 2026 | TechRadar" },
        { url: "https://www.g2.com/categories/crm", title: "g2.com" },
        { url: "https://www.zoho.com/crm/", title: "Zoho CRM official website" },
      ],
    });
    const result = answeredResult(base, answer, { brand: "Zoho CRM", domain: "zoho.com" });
    expect(result).toMatchObject({ webSearch: true, competitors: ["HubSpot CRM"] });
    expect(result.brand).toMatchObject({ mentioned: true, listPosition: 2 });
    expect(result.domain).toMatchObject({ mentioned: false, citedAt: [3] });
  });

  it("tell an answer without web search from one with it", async () => {
    show(unsearched);
    const read = await chatgptRead.fn({});
    expect(read).toMatchObject({ markdown: null, citations: 0, sourcesButton: false });
    expect(chatgptAnswer(read, [], false)).toMatchObject({
      webSearch: false,
      links: [
        { url: "https://asana.com/", title: "Asana official website" },
        { url: "https://clickup.com/", title: "ClickUp official website" },
      ],
    });
    // The "Searching the web" phase seen while waiting also counts.
    expect(chatgptAnswer(read, [], true).webSearch).toBe(true);
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
    const page = domPage(unsearched);
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
    const page = domPage(unsearched + composer);
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
