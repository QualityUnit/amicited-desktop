import * as NodeTls from "node:tls";
import * as Schema from "effect/Schema";
import type { ToolDefinition } from "@amicited/tools-core";

export const sslInput = Schema.Struct({
  domain: Schema.String.check(
    Schema.isPattern(
      /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
    ),
  ),
});
export const sslOutput = Schema.Struct({
  validTo: Schema.String,
  daysLeft: Schema.Number,
  issuer: Schema.String,
  chainOk: Schema.Boolean,
  grade: Schema.Literals(["A", "B", "C", "F"]),
  issues: Schema.Array(Schema.String),
});
export function certificateResult(
  cert: NodeTls.PeerCertificate,
  chainOk: boolean,
  now = Date.now(),
) {
  const expiry = new Date(cert.valid_to);
  if (!Number.isFinite(expiry.getTime())) throw new Error("No certificate expiry");
  const daysLeft = Math.floor((expiry.getTime() - now) / 86_400_000);
  const issues: string[] = [];
  if (!chainOk) issues.push("The certificate chain or hostname could not be verified.");
  if (daysLeft < 0) issues.push("The certificate has expired.");
  else if (daysLeft < 30) issues.push("The certificate expires in fewer than 30 days.");
  const grade: "A" | "B" | "C" | "F" =
    !chainOk || daysLeft < 0 ? "F" : daysLeft < 7 ? "C" : daysLeft < 30 ? "B" : "A";
  return {
    validTo: expiry.toISOString(),
    daysLeft,
    issuer: String(cert.issuer.O ?? cert.issuer.CN ?? "Unknown"),
    chainOk,
    grade,
    issues,
  };
}
export const sslCheck: ToolDefinition<typeof sslInput.Type, typeof sslOutput.Type> = {
  name: "seo.ssl.check",
  pack: "seo",
  title: "SSL certificate check",
  description:
    "Check whether visitors can trust your website’s secure connection and when its certificate expires.",
  keywords: ["security", "https", "certificate", "expiry", "site audit"],
  input: sslInput,
  output: sslOutput,
  cost: "free",
  timeoutMs: 20_000,
  schedulable: true,
  sideEffects: "none",
  run: ({ domain }, { signal }) =>
    new Promise((resolve, reject) => {
      const socket = NodeTls.connect({
        host: domain,
        servername: domain,
        port: 443,
        rejectUnauthorized: false,
      });
      const abort = () => socket.destroy(new Error("Aborted"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      socket.once("error", reject);
      socket.once("close", () => signal.removeEventListener("abort", abort));
      socket.once("secureConnect", () => {
        try {
          resolve(certificateResult(socket.getPeerCertificate(), socket.authorized));
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      });
    }),
};
