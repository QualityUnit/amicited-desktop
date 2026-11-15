import * as HtmlRender from "../htmlRender/HtmlRender.ts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Schema from "effect/Schema";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as Reports from "./Reports.ts";
import * as ReportsPreview from "./ReportsPreview.ts";
import * as HeadlessChrome from "../htmlRender/headlessChrome.ts";
import * as PreviewBrowserHost from "../preview/PreviewBrowserHost.ts";

const isBrowserError = Schema.is(HeadlessChrome.HtmlRenderBrowserError);
const isHostError = Schema.is(
  Schema.Union([
    PreviewBrowserHost.PreviewBrowserSandboxError,
    PreviewBrowserHost.PreviewBrowserLibrariesError,
    PreviewBrowserHost.PreviewBrowserRootError,
  ]),
);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const layer = HttpRouter.add(
  "GET",
  "/api/amicited/reports/*",
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://localhost");
    const preview = /^\/api\/amicited\/reports\/([^/]+)\/preview(\/events)?$/.exec(url.pathname);
    const snapshot = /^\/api\/amicited\/reports\/snapshots\/([^/]+)\.(html|pdf|pptx)$/.exec(
      url.pathname,
    );
    if (!preview && !snapshot) return HttpServerResponse.text("Not found", { status: 404 });
    const tokens = yield* ReportsPreview.ReportsPreview;
    const token = url.searchParams.get("token");
    if (token) {
      if (
        !(yield* tokens.verify(
          preview?.[1] ?? snapshot![1]!,
          token,
          preview ? "preview" : (snapshot![2]! as "html" | "pdf" | "pptx"),
        ))
      )
        return HttpServerResponse.text("Invalid preview token", { status: 401 });
    } else {
      const auth = yield* EnvironmentAuth.EnvironmentAuth;
      const session = yield* auth.authenticateHttpRequest(request);
      if (!session.scopes.includes(AuthOrchestrationReadScope))
        return HttpServerResponse.text("Forbidden", { status: 403 });
    }
    const reports = yield* Reports.Reports;
    const headers = {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    };
    if (preview) {
      const id = preview[1]!;
      yield* reports.get(id);
      if (preview[2]) {
        const expires = token ? Number(token.split(".")[0]) : Infinity;
        const events = reports.changes.pipe(
          Stream.filter((change) => change.reportId === id),
          Stream.takeWhile(() => clock.currentTimeMillisUnsafe() < expires),
          Stream.map((change) => `data: ${encodeJson(change)}\n\n`),
          Stream.encodeText,
        );
        return HttpServerResponse.stream(events, { contentType: "text/event-stream", headers });
      }
      const html = yield* reports.html(
        id,
        "preview",
        url.searchParams.get("embed") === "1" ? undefined : `${url.pathname}/events${url.search}`,
      );
      return HttpServerResponse.text(html, {
        contentType: "text/html",
        headers: {
          ...headers,
          "content-security-policy":
            url.searchParams.get("embed") === "1"
              ? "sandbox"
              : "sandbox allow-scripts allow-same-origin",
        },
      });
    }
    const id = snapshot![1]!;
    const extension = snapshot![2]!;
    if (extension === "pptx")
      return HttpServerResponse.uint8Array(yield* reports.pptx(id), {
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers,
      });
    const html = yield* reports.html(id, "snapshot");
    if (extension === "html")
      return HttpServerResponse.text(html, {
        contentType: "text/html",
        headers: { ...headers, "content-security-policy": "sandbox" },
      });
    const renderer = yield* HtmlRender.HtmlRender;
    return HttpServerResponse.uint8Array(yield* renderer.printPdf(html), {
      contentType: "application/pdf",
      headers,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const error = Cause.squash(cause);
        const tag =
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown";
        // Tag only: messages can carry upstream text.
        yield* Effect.logWarning("Report HTTP request failed.", {
          tag,
          ...(isBrowserError(error) ? { reason: error.reason } : {}),
        });
        if (isHostError(error)) return HttpServerResponse.text(error.message, { status: 503 });
        if (tag === "PreviewBrowserInstallingError")
          return HttpServerResponse.text("PDF export is getting ready. Try again in a minute.", {
            status: 503,
          });
        if (tag === "ReportFailure")
          return HttpServerResponse.text("Report unavailable", { status: 404 });
        if (tag.startsWith("ServerAuth"))
          return HttpServerResponse.text("Unauthorized", { status: 401 });
        return HttpServerResponse.text("Report export failed", { status: 500 });
      }),
    ),
  ),
);
