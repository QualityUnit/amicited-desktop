import { Globe } from "lucide-react";
import { useId, useState } from "react";
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
      ) : website ? (
        <Globe size={16} aria-hidden="true" />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
export function AmICitedMark() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <AmICitedLogo size={18} />
      <strong>AmICited</strong>
    </span>
  );
}
export function AmICitedLogo({ size }: { size: number }) {
  const mask = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <mask id={mask}>
          <rect width="32" height="32" fill="white" />
          <path
            d="M9 23v-4m5 4v-8m5 8V11m5 12V7"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <rect width="32" height="32" rx="9" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}
const LOADER_BARS = [
  { x: 7.5, y: 17.5, height: 7 },
  { x: 12.5, y: 13.5, height: 11 },
  { x: 17.5, y: 9.5, height: 15 },
  { x: 22.5, y: 5.5, height: 19 },
] as const;
export function AmICitedLoader({ label }: { label: string }) {
  const id = useId();
  return (
    <div className="am-loader" role="status">
      <svg aria-hidden="true" width="64" height="64" viewBox="0 0 32 32">
        <defs>
          {LOADER_BARS.map((bar, index) => (
            <clipPath key={bar.x} id={`${id}-${index}`}>
              <rect {...bar} width="3" rx="1.5" />
            </clipPath>
          ))}
        </defs>
        <rect width="32" height="32" rx="9" fill="currentColor" />
        {LOADER_BARS.map((bar, index) => (
          <g key={bar.x} clipPath={`url(#${id}-${index})`}>
            <rect className="am-loader-track" {...bar} width="3" />
            <rect className="am-loader-fill" data-bar={index + 1} {...bar} width="3" />
          </g>
        ))}
      </svg>
      <p>{label}</p>
    </div>
  );
}
