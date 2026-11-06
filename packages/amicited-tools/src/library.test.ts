// @effect-diagnostics nodeBuiltinImport:off - Recorded fixtures are read synchronously by these portable tool tests.
import * as NodeFS from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { siteTools, parseRobots, inspectMeta, inspectSchema } from "./seo/site.ts";
import { serpTools, parseSerp } from "./serp/tools.ts";
import { contentTools, readability, type Generation } from "./content/tools.ts";
import { visibilityTool } from "./ai-visibility/check.ts";
import { createMarketingTools } from "./index.ts";
import { sslCheck } from "./seo/ssl.ts";
const fixture = (name: string) =>
  NodeFS.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const ctx = () => ({ signal: new AbortController().signal });
const url = "https://example.com/";
const fakeFetch = (routes: Record<string, string>): typeof fetch =>
  vi.fn(async (input) => {
    const text = routes[String(input)];
    return new Response(text ?? "Not found", { status: text === undefined ? 404 : 200 });
  });
const provider = (generate: Generation["generate"]): Generation => ({
  provider: "Fake assistant",
  model: "fixture-model",
  generate,
});
describe("site tools", () => {
  it("honors specific agents, grouped agents, longest rules, and wildcard fallback", () => {
    const text = fixture("robots.txt");
    expect(parseRobots(text).access.find((a) => a.crawler === "GPTBot")?.allowed).toBe(false);
    expect(parseRobots(text, "/news/post").access.every((a) => a.allowed)).toBe(true);
    const privatePage = parseRobots(text, "/private/secret");
    expect(privatePage.access.every((a) => !a.allowed)).toBe(true);
    expect(
      parseRobots(text, "/private/public/page").access.find((a) => a.crawler === "CCBot")?.allowed,
    ).toBe(true);
    expect(privatePage.sitemaps).toEqual(["https://example.com/map.xml"]);
    expect(
      parseRobots(
        "User-agent: *\nDisallow: /*.pdf$\nAllow: /public/*.pdf$",
        "/report.pdf",
      ).access.every((a) => !a.allowed),
    ).toBe(true);
  });
  it("checks meta and graph structured data, reporting missing and invalid data", () => {
    expect(inspectMeta(fixture("site.html")).score).toBe(100);
    expect(inspectMeta('<html lang="en"><h1>Example Domain</h1></html>').details).toMatchObject({
      h1s: ["Example Domain"],
    });
    expect(
      inspectMeta('<html><meta name="robots" content="noindex"><h1>A</h1><h1>B</h1>').findings.find(
        (f) => f.title === "Search indexing",
      )?.status,
    ).toBe("fail");
    expect(inspectSchema(fixture("site.html")).details).toMatchObject({
      types: ["Organization", "Article"],
    });
    expect(
      inspectSchema(
        '<script type="application/ld+json">{"@type":"Product"}</script>',
      ).findings.some((f) => f.fix.includes("offers")),
    ).toBe(true);
    expect(
      inspectSchema('<script type="application/ld+json">broken</script>').findings.some(
        (f) => f.title === "Readable JSON-LD" && f.status === "fail",
      ),
    ).toBe(true);
  });
  it("finds advertised sitemaps and evaluates both AI guides", async () => {
    const tools = siteTools(
      fakeFetch({
        [url + "robots.txt"]: fixture("robots.txt"),
        [url + "map.xml"]: fixture("sitemap.xml"),
        [url + "llms.txt"]: "# Acme\n> Garden tools\n[Docs](https://example.com/docs)",
      }),
    );
    expect(await tools.robots.run({ url }, ctx())).toMatchObject({ status: "checked" });
    expect(
      await siteTools(fakeFetch({ [url + "robots.txt"]: fixture("site.html") })).robots.run(
        { url },
        ctx(),
      ),
    ).toMatchObject({ status: "could_not_check", score: null });
    expect(await tools.sitemap.run({ url }, ctx())).toMatchObject({
      status: "checked",
      details: { count: 2 },
    });
    const llms = await tools.llms.run({ url }, ctx());
    expect(llms.findings.map((f) => f.status)).toEqual(["pass", "warn"]);
    expect(llms.score).toBe(75);
  });
  it("scores missing files but excludes unreachable checks", async () => {
    for (const code of [404, 410, 503]) {
      const tools = siteTools(async () => new Response("", { status: code }), {
        ...sslCheck,
        run: async () => {
          throw new Error("offline");
        },
      });
      for (const [tool, status] of [
        [tools.robots, "warn"],
        [tools.sitemap, "fail"],
        [tools.llms, "warn"],
      ] as const) {
        const result = await tool.run({ url }, ctx());
        expect(result.findings[0]).toMatchObject(
          code === 503
            ? { status: "unknown" }
            : {
                title:
                  tool === tools.llms
                    ? "Publish /llms.txt"
                    : tool === tools.robots
                      ? "Publish robots.txt"
                      : "Publish a sitemap",
                status,
              },
        );
        expect(result.score).toBe(code === 503 ? null : status === "fail" ? 0 : 50);
      }
      const audit = await tools.audit.run({ url }, ctx());
      expect(audit.score).toBe(code === 503 ? null : 33);
      expect(audit.coverage).toContain("unavailable checks are excluded");
    }
    const complete = await siteTools(fakeFetch({ [url]: fixture("site.html") }), {
      ...sslCheck,
      run: async () => ({
        validTo: "2027-01-01",
        daysLeft: 60,
        issuer: "Fixture",
        chainOk: true,
        grade: "A",
        issues: [],
      }),
    }).audit.run({ url }, ctx());
    expect(complete.coverage).toBe("6/6 audit categories returned a score.");
  });
});
describe("SERP tools", () => {
  it("extracts organic results, overview citations and questions without inventing results on blocked pages", async () => {
    expect(parseSerp(fixture("serp.html"))).toMatchObject({
      status: "checked",
      organic: [{ title: "Acme tools", url: "https://acme.example/" }],
      aiOverview: { present: true, citations: ["https://example.com/source"] },
      peopleAlsoAsk: ["Which tools are best?"],
    });
    expect(parseSerp(fixture("captcha.html")).status).toBe("verification_required");
    expect(parseSerp(fixture("consent.html")).status).toBe("consent_required");
    expect(parseSerp("<html>Unknown layout</html>").status).toBe("could_not_parse");
    expect(await serpTools(fakeFetch({})).results.run({ query: "tools" }, ctx())).toMatchObject({
      status: "could_not_check",
    });
    expect(
      await serpTools(
        fakeFetch({ "https://www.google.com/search?q=tools&hl=en&gl=us": fixture("captcha.html") }),
      ).results.run({ query: "tools" }, ctx()),
    ).toMatchObject({ status: "verification_required" });
  });
  it("passes locale and country, deduplicates suggestions, and records failed expansions", async () => {
    const fetcher = fakeFetch({
      "https://suggestqueries.google.com/complete/search?client=firefox&q=tools&hl=sk&gl=sk":
        '["tools",["tools for teams","tools for teams"]]',
    });
    const tool = serpTools(fetcher).autocomplete;
    expect(await tool.run({ query: "tools", locale: "sk", country: "sk" }, ctx())).toMatchObject({
      status: "checked",
      suggestions: ["tools for teams"],
    });
    const expanded = await tool.run(
      { query: "tools", locale: "sk", country: "sk", alphabet: true },
      ctx(),
    );
    expect(expanded.status).toBe("partial");
    expect(expanded.failedQueries).toHaveLength(26);
  });
});
describe("content and visibility", () => {
  it("computes English reading scores, long sentences, and empty input honestly", async () => {
    expect(readability("The cat sat. The dog ran.")).toMatchObject({
      words: 6,
      sentences: 2,
      syllables: 6,
      readingEase: 119.2,
    });
    expect(readability("").readingEase).toBeNull();
    expect(readability("word ".repeat(30) + ".").longSentences).toHaveLength(1);
    const tools = contentTools(fakeFetch({ [url]: fixture("site.html") }));
    expect((await tools.readable.run({ url }, ctx())).words).toBeGreaterThan(10);
    expect((await tools.citable.run({ url }, ctx())).score).toBe(100);
    await expect(tools.readable.run({}, ctx())).rejects.toThrow("Enter text");
  });
  it("uses the supplied assistant for drafts and all repurposing formats, exposing failures", async () => {
    const generate = vi.fn(async (_prompt: string) => "A sourced draft.");
    const tools = contentTools(fakeFetch({ [url]: fixture("site.html") }), provider(generate));
    expect(
      await tools.write.run(
        {
          brief: "A garden launch",
          channel: "email",
          tone: "warm",
          brandVoice: "Plain and practical",
        },
        ctx(),
      ),
    ).toMatchObject({ status: "ready", draft: "A sourced draft.", model: "fixture-model" });
    expect(await tools.repurpose.run({ url }, ctx())).toMatchObject({ status: "ready" });
    expect(generate.mock.calls[0]?.[0]).toContain("Plain and practical");
    expect(generate.mock.calls[1]?.[0]).toContain("LinkedIn post");
    const offline = contentTools(fakeFetch({}));
    expect(
      await offline.write.run({ brief: "Launch", channel: "email", tone: "warm" }, ctx()),
    ).toMatchObject({ status: "needs_provider" });
    expect(await offline.repurpose.run({ text: "Source" }, ctx())).toMatchObject({
      status: "needs_provider",
    });
    expect(
      await contentTools(
        fakeFetch({}),
        provider(async () => {
          throw new Error("offline");
        }),
      ).write.run({ brief: "Launch", channel: "email", tone: "warm" }, ctx()),
    ).toMatchObject({ status: "could_not_generate", draft: null });
  });
  it("counts only successful visibility answers and preserves prompts and scope", async () => {
    const generate = vi.fn(async (prompt: string) => {
      if (prompt.includes("best value")) throw new Error("offline");
      return "Beta then Acme. https://example.com/source";
    });
    const input = { brand: "Acme", website: url, category: "garden tools", competitors: ["Beta"] };
    const result = await visibilityTool(provider(generate)).run(input, ctx());
    expect(result).toMatchObject({
      status: "partial",
      summary: { mentioned: 3, answered: 3, shareOfVoice: 50 },
      answers: expect.arrayContaining([
        expect.objectContaining({ status: "could_not_check", mentioned: null, position: null }),
        expect.objectContaining({ mentioned: true, position: 2 }),
      ]),
    });
    expect(result.scope.prompts).toHaveLength(4);
    expect(generate.mock.calls.every(([prompt]) => !prompt.includes("Acme"))).toBe(true);
    expect(await visibilityTool().run(input, ctx())).toMatchObject({
      status: "needs_provider",
      summary: { answered: 0, shareOfVoice: null },
    });
    expect(
      await visibilityTool(
        provider(async () => {
          throw new Error("offline");
        }),
      ).run(input, ctx()),
    ).toMatchObject({ status: "could_not_check", summary: { answered: 0, shareOfVoice: null } });
    expect(
      await visibilityTool(provider(async () => "Acmeology is useful.")).run(input, ctx()),
    ).toMatchObject({ summary: { mentioned: 0, answered: 4 } });
  });
  it("registers all 14 tools with schemas and rejects invalid URLs at the shared boundary", async () => {
    const registry = createMarketingTools();
    expect(registry.list()).toHaveLength(14);
    expect(registry.search("visibility").map((t) => t.name)).toContain("ai.visibility.check");
    expect(await registry.run("seo.meta.check", { url: "file:///etc/passwd" })).toMatchObject({
      status: "error",
      error: { code: "invalid_input" },
    });
    expect(
      await registry.run("content.write", { brief: "Draft", channel: "email", tone: "warm" }),
    ).toMatchObject({ status: "success", output: { status: "needs_provider" } });
  });
});
