import { useState } from "react";
export type Brand = { website: string; name: string };
export function readBrand(): Brand | null {
  try {
    return JSON.parse(localStorage.getItem("amicited.brand") ?? "null") as Brand | null;
  } catch {
    return null;
  }
}
export function saveBrand(brand: Brand) {
  localStorage.setItem("amicited.brand", JSON.stringify(brand));
}
export function normalizeWebsite(value: string): Brand {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes("."))
    throw new Error("Enter a website like example.com.");
  const name = url.hostname
    .replace(/^www\./, "")
    .split(".")[0]!
    .replace(/-/g, " ");
  return { website: url.origin, name: name.charAt(0).toUpperCase() + name.slice(1) };
}
export function BrandFavicon({ website, name }: { website?: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="am-favicon">
      {website && !failed ? (
        <img alt="" src={website + "/favicon.ico"} onError={() => setFailed(true)} />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
export function AmICitedMark() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill="var(--ai-accent)" />
        <path
          d="M9 23v-4m5 4v-8m5 8V11m5 12V7"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <strong>AmICited</strong>
    </span>
  );
}
