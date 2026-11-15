import { HttpServer } from "effect/http";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ReportFailure } from "@amicited/reports/rpc";
import * as PayloadSigner from "../auth/PayloadSigner.ts";
import * as ServerConfig from "../config.ts";

export class ReportsPreview extends Context.Service<
  ReportsPreview,
  {
    readonly url: (id: string) => Effect.Effect<string, ReportFailure>;
    readonly path: (
      id: string,
      format: "preview" | "html" | "pdf" | "pptx",
    ) => Effect.Effect<string, ReportFailure>;
    readonly verify: (
      id: string,
      token: string,
      format?: "preview" | "html" | "pdf" | "pptx",
    ) => Effect.Effect<boolean, ReportFailure>;
  }
>()("t3/amicited/ReportsPreview") {}
export const layer = Layer.effect(
  ReportsPreview,
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const signer = yield* PayloadSigner.make("amicited-report-preview-key");
    const config = yield* ServerConfig.ServerConfig;
    const server = yield* HttpServer.HttpServer;
    const signedPath = Effect.fn("ReportsPreview.signedPath")(function* (
      id: string,
      format: "preview" | "html" | "pdf" | "pptx",
      ttl: number,
    ) {
      const expires = clock.currentTimeMillisUnsafe() + ttl;
      const signature = yield* signer
        .sign(`reports:${format}:${id}:${expires}`)
        .pipe(Effect.mapError(() => new ReportFailure({ message: "Could not sign report link." })));
      const route =
        format === "preview"
          ? `${encodeURIComponent(id)}/preview`
          : `snapshots/${encodeURIComponent(id)}.${format}`;
      return `/api/amicited/reports/${route}?token=${expires}.${signature}`;
    });
    const path = Effect.fn("ReportsPreview.path")(
      (id: string, format: "preview" | "html" | "pdf" | "pptx") =>
        signedPath(id, format, 10 * 60 * 1000),
    );
    const url = Effect.fn("ReportsPreview.url")(function* (id: string) {
      const port = "port" in server.address ? server.address.port : config.port;
      const host =
        config.host && !["0.0.0.0", "::"].includes(config.host) ? config.host : "127.0.0.1";
      const hostname = host.includes(":") ? `[${host}]` : host;
      return `http://${hostname}:${port}${yield* signedPath(id, "preview", 12 * 60 * 60 * 1000)}`;
    });
    const verify = Effect.fn("ReportsPreview.verify")(function* (
      id: string,
      token: string,
      format: "preview" | "html" | "pdf" | "pptx" = "preview",
    ) {
      if (token.split(".").length !== 2) return false;
      const [expires, signature] = token.split(".");
      if (
        !expires ||
        !signature ||
        !/^\d+$/.test(expires) ||
        Number(expires) <= clock.currentTimeMillisUnsafe() ||
        Number(expires) > clock.currentTimeMillisUnsafe() + 12 * 60 * 60 * 1000
      )
        return false;
      return yield* signer
        .verify(`reports:${format}:${id}:${expires}`, signature)
        .pipe(Effect.mapError(() => new ReportFailure({ message: "Could not verify preview." })));
    });
    return { url, path, verify };
  }),
);
