import { cmsPaths } from "./cmsPaths.js";
const options = [
  ["wordpress", "WordPress"],
  ["webflow", "Webflow"],
  ["shopify", "Shopify"],
  ["wix", "Wix"],
  ["squarespace", "Squarespace"],
  ["hubspot", "HubSpot CMS"],
  ["ghost", "Ghost"],
  ["headless", "Headless CMS"],
  ["git", "Git-based site"],
  ["unknown", "Not sure"],
] as const;
type Cms = (typeof options)[number][0];
export function CmsGrid({
  value,
  onChange,
  disabled,
}: {
  value: Cms;
  onChange(value: Cms): void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="am-cms" disabled={disabled}>
      <legend>What your site runs on (optional)</legend>
      <div className="am-cms-grid" role="radiogroup" aria-label="What your site runs on">
        {options.map(([id, name]) => (
          <label key={id} className="am-cms-tile">
            <input
              type="radio"
              name="cms"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
              {cmsPaths[id] ? (
                <path d={cmsPaths[id]} />
              ) : (
                <path d="M11 17h2v2h-2zm1-15a6 6 0 0 0-6 6h2a4 4 0 1 1 6 3.46c-2 1.15-3 2.54-3 4.54h2c0-1.3.5-2 2-2.8A6 6 0 0 0 12 2z" />
              )}
            </svg>
            <span>{name}</span>
            {id === "headless" && <small>Contentful · Sanity · Strapi</small>}
            {id === "git" && <small>Next.js · Astro · Hugo</small>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
