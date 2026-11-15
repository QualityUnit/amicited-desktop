import { RELEASES_URL, SOURCE_REPOSITORY } from "@amicited/identity";

export { RELEASES_URL };
export const NIGHTLY_RELEASES_URL = `${RELEASES_URL}?q=nightly&expanded=true`;

// TODO(amicited-infra): the release repo may stay private (QualityUnit/amicited-desktop#17). If it
// does, these API calls fail and the download page falls back to RELEASES_URL.
const LATEST_API_URL = `https://api.github.com/repos/${SOURCE_REPOSITORY}/releases/latest`;
// GitHub's latest endpoint excludes prereleases; the newest nightly comes from the ordered release list.
const LIST_API_URL = `https://api.github.com/repos/${SOURCE_REPOSITORY}/releases?per_page=10`;

export type ReleaseChannel = "stable" | "nightly";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
}

function cacheKey(channel: ReleaseChannel) {
  return `amicited-${channel}-release`;
}

async function fetchStable(): Promise<Release> {
  const response = await fetch(LATEST_API_URL);
  // A private repo answers 404; callers fall back to the releases page.
  if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
  return response.json();
}

async function fetchNightly(): Promise<Release> {
  const list: Release[] = await fetch(LIST_API_URL).then((r) => r.json());
  const nightly = Array.isArray(list)
    ? list.find((release) => release.tag_name?.includes("-nightly."))
    : undefined;
  if (!nightly) throw new Error("No nightly release in the latest page");
  return nightly;
}

export async function fetchLatestRelease(channel: ReleaseChannel = "stable"): Promise<Release> {
  const key = cacheKey(channel);
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const data = channel === "nightly" ? await fetchNightly() : await fetchStable();

  if (data?.assets) {
    sessionStorage.setItem(key, JSON.stringify(data));
  }

  return data;
}
