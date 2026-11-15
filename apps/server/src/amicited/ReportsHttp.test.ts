import { templates } from "@amicited/reports/templates";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";
import { AuthSessionId, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as Reports from "./Reports.ts";
import * as ReportsPreview from "./ReportsPreview.ts";
import * as ReportsHttp from "./ReportsHttp.ts";
import * as HtmlRender from "../htmlRender/HtmlRender.ts";
import * as PreviewBrowserHost from "../preview/PreviewBrowserHost.ts";

it("uses format-scoped links, suppresses embed scripts, sandboxes HTML and exposes PDF setup failures", async () => {
  const services = Layer.mergeAll(
    Layer.mock(ReportsPreview.ReportsPreview)({
      verify: (_id, token, format) => Effect.succeed(token === format),
    }),
    Layer.mock(EnvironmentAuth.EnvironmentAuth)({
      authenticateHttpRequest: () =>
        Effect.succeed({
          sessionId: AuthSessionId.make("test"),
          subject: "owner",
          method: "browser-session-cookie" as const,
          scopes: [AuthOrchestrationReadScope],
        }),
    }),
    Layer.mock(Reports.Reports)({
      get: () =>
        Effect.succeed({
          id: "r",
          projectId: "p",
          title: "Report",
          specRevision: 1,
          threadId: null,
          narrativeEnabled: false,
          createdAt: "2026-11-15",
          updatedAt: "2026-11-15",
          archivedAt: null,
          spec: templates[0]!.spec,
        }),
      html: (_id, _mode, events) =>
        Effect.succeed(events ? "<script>reload()</script>" : "<p>Report</p>"),
    }),
    Layer.mock(HtmlRender.HtmlRender)({
      printPdf: () =>
        Effect.fail(
          new PreviewBrowserHost.PreviewBrowserSandboxError({ setupCommand: "t3 browser setup" }),
        ),
    }),
  );
  const { handler, dispose } = HttpRouter.toWebHandler(
    ReportsHttp.layer.pipe(Layer.provideMerge(services)),
    { disableLogger: true },
  );
  try {
    const embedded = await handler(
      new Request("http://localhost/api/amicited/reports/r/preview?token=preview&embed=1"),
    );
    expect(embedded.status).toBe(200);
    expect(embedded.headers.get("content-security-policy")).toBe("sandbox");
    expect(await embedded.text()).not.toContain("<script");
    const html = await handler(
      new Request("http://localhost/api/amicited/reports/snapshots/s.html?token=html"),
    );
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toBe("sandbox");
    const wrong = await handler(
      new Request("http://localhost/api/amicited/reports/snapshots/s.pdf?token=html"),
    );
    expect(wrong.status).toBe(401);
    const pdf = await handler(
      new Request("http://localhost/api/amicited/reports/snapshots/s.pdf?token=pdf"),
    );
    expect(pdf.status).toBe(503);
    expect(await pdf.text()).toContain("t3 browser setup");
    const session = await handler(
      new Request("http://localhost/api/amicited/reports/snapshots/s.html"),
    );
    expect(session.status).toBe(200);
  } finally {
    await dispose();
  }
});
