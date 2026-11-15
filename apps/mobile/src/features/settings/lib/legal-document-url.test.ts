import { describe, expect, it } from "vite-plus/test";

import { isLegalDocumentUrl, LEGAL_URL } from "./legal-document-url";

describe("isLegalDocumentUrl", () => {
  it.each(["https://example.com/legal", "javascript:alert(1)"])(
    "rejects a URL outside the legal-document allowlist: %s",
    (url) => {
      expect(isLegalDocumentUrl(url)).toBe(false);
    },
  );
});

describe("LEGAL_URL", () => {
  it("opens AmICited's privacy policy", () => {
    expect(LEGAL_URL).toBe("https://www.flowhunt.io/privacy-policy/");
    expect(isLegalDocumentUrl(LEGAL_URL)).toBe(true);
  });
});
