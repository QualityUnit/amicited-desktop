import { describe, expect, it } from "vite-plus/test";
import {
  normalizeWebsite,
  resultFindings,
  resultTone,
  resultMarkdown,
  marketingTaskStatus,
} from "./experience.js";
import type { ToolResult } from "@amicited/tools-core";
describe("marketer website and results", () => {
  it("normalizes domains and rejects non-web addresses", () => {
    expect(normalizeWebsite("www.example.com/page")).toEqual({
      website: "https://www.example.com",
      name: "Example",
    });
    expect(() => normalizeWebsite("file://local.txt")).toThrow();
    expect(() => normalizeWebsite("not a website")).toThrow();
  });
  it("keeps warning and failure findings distinct without inventing passes", () => {
    const base: ToolResult = {
      id: "fixture",
      tool: "seo.site.audit",
      input: {},
      startedAt: "2026-01-01",
      durationMs: 1,
      status: "success",
      output: {
        findings: [
          {
            title: "Missing title",
            severity: "error",
            whyItMatters: "Search clarity",
            fix: "Write a title",
          },
          { title: "Short description", status: "warn" },
          { title: "Secure", status: "pass" },
        ],
      },
    };
    expect(resultMarkdown(base)).toContain("# Website health audit");
    expect(resultMarkdown(base)).toContain("Write a title");
    expect(resultMarkdown(base)).not.toContain('"findings"');
    expect(resultFindings(base).map((f) => f.status)).toEqual(["fail", "warn", "pass"]);
    for (const [statuses, tone] of [
      [["pass"], "good"],
      [["warn", "pass"], "warning"],
      [["fail", "pass"], "critical"],
      [["unknown", "pass"], "unavailable"],
      [[], "unavailable"],
    ] as const) {
      expect(
        resultTone({
          ...base,
          output: { findings: statuses.map((status) => ({ status, title: status })) },
        }),
      ).toBe(tone);
    }
    expect(resultFindings(base)[0]).toMatchObject({ why: "Search clarity", fix: "Write a title" });
    expect(resultFindings({ ...base, status: "error", output: undefined })).toEqual([]);
    expect(
      resultFindings({
        ...base,
        output: {
          score: 50,
          groups: [
            {
              name: "Search preview",
              result: {
                findings: [
                  {
                    title: "Missing title",
                    status: "fail",
                    why: "Search clarity",
                    fix: "Write a title",
                  },
                  { title: "Unavailable", status: "unknown", why: "No response", fix: "Try again" },
                ],
              },
            },
          ],
        },
      }),
    ).toMatchObject([
      { title: "Missing title", status: "fail", group: "Search preview" },
      { title: "Unavailable", status: "unknown", group: "Search preview" },
    ]);
  });

  it("distinguishes failed tasks and requests for input from idle tasks", () => {
    expect(marketingTaskStatus("failed", false)).toBe("Couldn't finish");
    expect(marketingTaskStatus("waiting", true)).toBe("Needs you");
    expect(marketingTaskStatus("completed", false)).toBe("Done");
    expect(marketingTaskStatus("running", false)).toBe("Working");
    for (const status of ["interrupted", "cancelled"])
      expect(marketingTaskStatus(status, false)).toBe("Stopped");
    for (const status of [undefined, "queued"])
      expect(marketingTaskStatus(status, false)).toBe("Ready");
  });
});
