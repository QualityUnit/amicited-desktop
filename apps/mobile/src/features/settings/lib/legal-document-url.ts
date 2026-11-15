import { PRIVACY_POLICY_URL } from "@amicited/identity";

// TODO(amicited-infra): AmICited publishes only a privacy policy. Add the terms of service, the
// security policy and a legal page that links them here once they exist.
// https://github.com/QualityUnit/amicited-desktop/blob/main/apps/mobile/README.md#app-identity-and-amicited-infrastructure
export const LEGAL_URL = PRIVACY_POLICY_URL;

const ALLOWED_LEGAL_DOCUMENT_URLS = [PRIVACY_POLICY_URL] as const;

function webDocumentIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

const ALLOWED_LEGAL_DOCUMENT_IDENTITIES = new Set(
  ALLOWED_LEGAL_DOCUMENT_URLS.map(webDocumentIdentity).filter(
    (value): value is string => value !== null,
  ),
);

export function isLegalDocumentUrl(value: string): boolean {
  const identity = webDocumentIdentity(value);
  return identity !== null && ALLOWED_LEGAL_DOCUMENT_IDENTITIES.has(identity);
}
