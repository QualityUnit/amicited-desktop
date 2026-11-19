// @effect-diagnostics nodeBuiltinImport:off - Recorded pages are read synchronously by these tests.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type { EngineContext } from "../engine.ts";
import type { EnginePage, PageScript } from "../page.ts";
import { answeredResult, type Subject } from "../result.ts";
import { GoogleOverviewsEngine, googleAnswer } from "./googleOverviews.ts";
import type { GoogleSearchSnapshot } from "./googleOverviews.scripts.ts";

const engine = new GoogleOverviewsEngine();

/**
 * What `readGoogleSearch` returned on real results pages in Firefox through the connector. The
 * DOM side needs a real browser, so these cover how the app interprets what the page holds.
 */
function readPage(name: string, subject: Subject) {
  const file = `${import.meta.dirname}/fixtures/${name}.json`;
  const snapshot = JSON.parse(NodeFS.readFileSync(file, "utf8")) as GoogleSearchSnapshot;
  return answeredResult(
    { engine: "google_overviews", prompt: name, capturedAt: "", country: "SK" },
    googleAnswer(snapshot),
    subject,
  );
}

describe("Google results pages", () => {
  it("reads the overview's citations in order, and the organic ranking", () => {
    const result = readPage("google-overview", {
      brand: "National Geographic",
      domain: "nationalgeographic.org",
    });
    expect(result.search?.overview).toBe(true);
    expect(result.text).toMatch(/^Photosynthesis is the process plants, algae/);
    expect(result.text).toContain("water (H2O) absorbed through roots");
    // Image tiles (sciencefocus.com) are not citations. A citation first known by its site
    // (Wikipedia) takes the first full URL on that site; one never named in full stays a site.
    expect(result.sources.map((s) => s.url)).toEqual([
      "https://www.monash.edu/student-academic-success/biology/photosynthesis/the-process-of-photosynthesis",
      "https://en.wikipedia.org/wiki/Photosynthesis",
      "https://www.bbc.co.uk/",
      "https://education.nationalgeographic.org/resource/photosynthesis/",
      "https://www.snexplores.org/article/explainer-how-photosynthesis-works",
      "https://flexbooks.ck12.org/",
      "https://www.youtube.com/watch?v=CMiPYHNNg28",
    ]);
    expect(result.sources[3]?.title).toBe("National Geographic Society");
    // People Also Ask and the video pack sit between these results and are not counted.
    expect(result.search?.organic.map((r) => [r.position, r.domain])).toEqual([
      [1, "en.wikipedia.org"],
      [2, "monash.edu"],
      [3, "education.nationalgeographic.org"],
      [4, "pmc.ncbi.nlm.nih.gov"],
      [5, "snexplores.org"],
      [6, "bbc.co.uk"],
      [7, "britannica.com"],
      [8, "youtube.com"],
    ]);
    expect(result.search?.organic[0]).toMatchObject({
      url: "https://en.wikipedia.org/",
      title: "Photosynthesis",
    });
    expect(result.domain.citedAt).toEqual([4]);
    expect(result.search?.domainAt).toEqual([3]);
  });

  it("ranks the brand in the overview's list and ignores display text in Google's data", () => {
    const result = readPage("google-commercial", { brand: "HubSpot", domain: "hubspot.com" });
    expect(result.brand).toMatchObject({ mentioned: true, listPosition: 1 });
    expect(result.competitors).toEqual([
      "Pipedrive",
      "Zoho CRM",
      "monday CRM",
      "Less Annoying CRM",
    ]);
    expect(result.sources.map((s) => s.domain)).toEqual([
      "uschamber.com",
      "uk.pcmag.com",
      "routine-automation.com",
      "startups.co.uk",
      "zoho.com",
      "youtube.com",
      "forbes.com",
    ]);
    expect(result.search?.organic.map((r) => r.domain)).toEqual([
      "slack.com",
      "uschamber.com",
      "uk.pcmag.com",
      "1crm.com",
      "zoho.com",
      "startups.co.uk",
      "salesforce.com",
      "routine-automation.com",
    ]);
    expect(result.search?.domainAt).toEqual([]);
  });

  it("records a page without an overview with its organic results", () => {
    const result = readPage("google-no-overview", { brand: "YouTube", domain: "youtube.com" });
    expect(result).toMatchObject({ text: "No AI Overview shown", sources: [] });
    expect(result.search?.overview).toBe(false);
    // Google links its own properties directly; social profiles show only the platform's name.
    expect(result.search?.organic.map((r) => r.url)).toEqual([
      "https://www.youtube.com/",
      "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=sk",
      "https://instagram.com/",
      "https://apps.apple.com/",
      "https://en.wikipedia.org/",
      "https://facebook.com/",
    ]);
    expect(result.search?.domainAt).toEqual([1]);
  });
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
const subject = { brand: "Northwind", domain: "northwind.io" };

/** A results page driven by script name: a consent screen, then an overview that streams. */
class ScriptedSearch implements EnginePage {
  readonly driver = "fake";
  readonly browser = "Test page";
  readonly log: string[] = [];
  url = "";
  reads = 0;
  expanded = false;
  readonly options: { readonly consent?: "clicked" | "missing"; readonly overview?: string[] };
  constructor(options: ScriptedSearch["options"]) {
    this.options = options;
  }
  async goto(url: string) {
    this.log.push(`goto ${url}`);
    this.url = this.options.consent ? "https://consent.google.com/ml?continue=x" : url;
  }
  async run<A, R>(script: PageScript<A, R>, arg: A): Promise<R> {
    const value = (): unknown => {
      if (script.name === "inspect")
        return {
          url: this.url,
          title: "",
          visible: (arg as { selectors: string[] }).selectors.map((s) => s === "#rso, #search"),
        };
      if (script.name === "rejectGoogleConsent") {
        if (!this.url.includes("consent.google")) return "none";
        if (this.options.consent === "missing") return "missing";
        this.url = "https://www.google.com/search?q=x";
        return "clicked";
      }
      if (script.name === "expandGoogleOverview") {
        this.log.push("expand");
        this.expanded = true;
        return 1;
      }
      const stream = this.options.overview ?? [];
      const text = this.expanded
        ? `${stream.at(-1)} Northwind leads.`
        : (stream[Math.min(this.reads++, stream.length - 1)] ?? "");
      return {
        url: this.url,
        results: true,
        overview: stream.length
          ? { text, items: [{ kind: "link", url: "https://northwind.io/guide", label: "Guide" }] }
          : null,
        organic: [
          {
            url: "https://www.google.com/goto?url=x",
            title: "Northwind",
            text: "",
            cite: "https://northwind.io › guide",
          },
        ],
      };
    };
    return value() as R;
  }
  async type() {}
  async press() {}
  async click() {}
  async close() {}
  isClosed() {
    return false;
  }
}

describe("Google AI Overviews engine", () => {
  it("searches with the country, waits out the stream, expands the overview and reads it", async () => {
    const page = new ScriptedSearch({ overview: ["Best", "Best tools", "Best tools are"] });
    const result = await engine.run(
      page,
      { prompt: "best tools", country: "SK", ...subject },
      context(),
    );
    expect(page.log).toEqual(["goto https://www.google.com/search?q=best+tools&gl=sk", "expand"]);
    expect(result).toMatchObject({
      status: "answered",
      text: "Best tools are Northwind leads.",
      sources: [{ url: "https://northwind.io/guide", position: 1 }],
      brand: { mentioned: true },
      search: {
        overview: true,
        organic: [{ position: 1, url: "https://northwind.io/", domain: "northwind.io" }],
        domainAt: [1],
      },
    });
  });

  it("records the organic results when no overview appears", async () => {
    const page = new ScriptedSearch({});
    const result = await engine.run(page, { prompt: "q", country: "ZZ", ...subject }, context());
    expect(page.log).toEqual(["goto https://www.google.com/search?q=q"]);
    expect(result).toMatchObject({
      status: "answered",
      search: { overview: false, domainAt: [1] },
    });
  });

  it("rejects cookies on Google's consent screen, and stops when it cannot", async () => {
    const passed = await engine.run(
      new ScriptedSearch({ consent: "clicked", overview: ["Answer"] }),
      { prompt: "q", country: "DE", ...subject },
      context(),
    );
    expect(passed.status).toBe("answered");
    const stuck = await engine.run(
      new ScriptedSearch({ consent: "missing" }),
      { prompt: "q", country: "DE", ...subject },
      context(),
    );
    expect(stuck).toMatchObject({ status: "blocked", reason: expect.stringContaining("cookies") });
  });
});
