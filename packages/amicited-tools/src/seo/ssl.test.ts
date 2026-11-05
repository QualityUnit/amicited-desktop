import { it, expect } from "vite-plus/test";
import { certificateResult, sslInput } from "./ssl.ts";
import * as Schema from "effect/Schema";
import * as NodeTls from "node:tls";
const certificate = {
  valid_to: "Dec 31 23:59:59 2026 GMT",
  issuer: { O: "Recorded test CA" },
} as NodeTls.PeerCertificate;
it("grades a recorded certificate for expiry and trust failures", () => {
  expect(certificateResult(certificate, true, Date.parse("2026-11-01"))).toMatchObject({
    issuer: "Recorded test CA",
    grade: "A",
    chainOk: true,
    daysLeft: 60,
    issues: [],
  });
  expect(certificateResult(certificate, true, Date.parse("2026-12-20"))).toMatchObject({
    grade: "B",
  });
  expect(certificateResult(certificate, true, Date.parse("2026-12-29"))).toMatchObject({
    grade: "C",
  });
  expect(certificateResult(certificate, false, Date.parse("2027-01-01"))).toMatchObject({
    grade: "F",
    chainOk: false,
    daysLeft: -1,
  });
  expect(() => Schema.decodeSync(sslInput)({ domain: "https://example.com/path" })).toThrow();
});
