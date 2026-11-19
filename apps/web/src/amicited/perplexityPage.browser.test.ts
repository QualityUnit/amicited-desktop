import { pageScripts } from "@amicited/visibility/scripts";
import { describe, expect, it } from "vite-plus/test";
import answerHtml from "./fixtures/perplexity-answer.html?raw";
import wallHtml from "./fixtures/perplexity-wall.html?raw";

/** Runs the connector's bundled page script the way the extension does: serialised, on a page. */
async function readPage(html: string) {
  const script = pageScripts().get("readPerplexityAnswer")!;
  const run = new Function(`return (${script.fn.toString()})`)() as (arg: null) => Promise<{
    page: { text: string; links: { url: string; title: string }[]; finished: boolean };
  }>;
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1]!;
  try {
    return (await run(null)).page;
  } finally {
    document.body.innerHTML = "";
  }
}

describe("reading Perplexity's page", () => {
  // Captured signed out on 2026-11-19: Perplexity answered with its sign-up gate.
  it("reads the sign-up wall a signed-out ask gets", async () => {
    expect(await readPage(wallHtml)).toMatchObject({
      text: "Sign up and repeat your request.",
      links: [],
      finished: true,
      gated: true,
    });
  });

  // The captured page's wrappers around answer markup in the shape Perplexity's renderer emits.
  it("reads the whole answer as Markdown-like text and every citation chip in order", async () => {
    const page = await readPage(answerHtml);
    expect(page.text).toBe(
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
    expect([...new Set(page.links.map((l) => l.url))]).toEqual([
      "https://www.g2.com/categories/crm",
      "https://www.hubspot.com/products/crm",
      "https://www.zoho.com/crm/",
      "https://www.pipedrive.com/en/features",
      "https://www.hubspot.com/pricing/crm",
      "https://www.pipedrive.com/en/pricing",
    ]);
    expect(page.links.at(-1)).toEqual({
      url: "https://www.pipedrive.com/en/pricing",
      title: "Pipedrive's pricing page",
    });
    expect(page).toMatchObject({ finished: true, gated: false });
  });
});
