import { expect, it } from "vite-plus/test";
import { evidenceEnabled } from "./EvidenceFixtures.ts";
it("requires every development capture flag and rejects production", () => {
  expect(evidenceEnabled({})).toBe(false);
  expect(
    evidenceEnabled({
      NODE_ENV: "production",
      T3CODE_DEV_REPLAY_CAPTURE: "1",
      T3CODE_DEV_AMICITED_EVIDENCE: "1",
    }),
  ).toBe(false);
  expect(
    evidenceEnabled({
      NODE_ENV: "development",
      T3CODE_DEV_REPLAY_CAPTURE: "1",
      T3CODE_DEV_AMICITED_EVIDENCE: "1",
    }),
  ).toBe(true);
});
