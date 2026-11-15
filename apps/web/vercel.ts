import { matchers, routes, type Transform, type VercelConfig } from "@vercel/config/v1";

// TODO(amicited-infra): AmICited hosts no web app yet. Set these on the router deployment once it
// exists; without them the deployment serves its own build and routes no channel host.
// https://github.com/QualityUnit/amicited-desktop/blob/main/docs/amicited/EXTENSION-POINTS.md#amicited-link-and-hosted-links
const ROUTER_HOST = process.env.AMICITED_HOSTED_WEB_ROUTER_HOST?.trim() || null;
const HOSTED_WEB_CHANNEL_COOKIE = "amicited_web_channel";
const LATEST_ORIGIN = process.env.AMICITED_HOSTED_WEB_LATEST_ORIGIN?.trim() || null;
const NIGHTLY_ORIGIN = process.env.AMICITED_HOSTED_WEB_NIGHTLY_ORIGIN?.trim() || null;
const CLEAN_CHANNEL_QUERY_TRANSFORMS = [
  {
    type: "request.query",
    op: "delete",
    target: { key: "channel" },
  },
] satisfies Transform[];

function channelCookie(channel: "latest" | "nightly"): string {
  return [
    `${HOSTED_WEB_CHANNEL_COOKIE}=${channel}`,
    "Path=/",
    "Max-Age=31536000",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export const config: VercelConfig = {
  buildCommand:
    'vp run --filter @t3tools/web build && node ../../scripts/apply-web-brand-assets.ts --channel "${VITE_HOSTED_APP_CHANNEL:-latest}"',
  git: {
    deploymentEnabled: false,
  },
  installCommand:
    "npm install -g vite-plus && vp install --ignore-scripts --filter '@t3tools/scripts...' --filter '@t3tools/web...'",
  routes: [
    {
      src: "/__amicited/channel",
      has: [matchers.query("channel", "nightly")],
      transforms: CLEAN_CHANNEL_QUERY_TRANSFORMS,
      headers: {
        Location: "/",
        "Set-Cookie": channelCookie("nightly"),
      },
      status: 302,
    },
    {
      src: "/__amicited/channel",
      transforms: CLEAN_CHANNEL_QUERY_TRANSFORMS,
      headers: {
        Location: "/",
        "Set-Cookie": channelCookie("latest"),
      },
      status: 302,
    },
    ...(ROUTER_HOST && NIGHTLY_ORIGIN
      ? [
          {
            src: "/(.*)",
            has: [
              matchers.host(ROUTER_HOST),
              matchers.cookie(HOSTED_WEB_CHANNEL_COOKIE, "nightly"),
            ],
            dest: `${NIGHTLY_ORIGIN}/$1`,
          },
        ]
      : []),
    ...(ROUTER_HOST && LATEST_ORIGIN
      ? [{ src: "/(.*)", has: [matchers.host(ROUTER_HOST)], dest: `${LATEST_ORIGIN}/$1` }]
      : []),
  ],
  rewrites: [
    // Apple fetches it without an extension; the .json file is served as application/json.
    routes.rewrite(
      "/.well-known/apple-app-site-association",
      "/.well-known/apple-app-site-association.json",
    ),
    routes.rewrite("/(.*)", "/index.html"),
  ],
};
