# Marketer design

The cloud source is the read-only flowhunt2 origin/main export at **44d4019d4c**,
`frontend/src`. Ports live in `packages/amicited-ui/src/cloud`; each file records
its source path and revision. Keep JSX and class strings in those components;
do not recreate their typography in `marketing.css`.

| Cloud source (under frontend/src)                                                  | Desktop port                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| components/side-menu/SideMenuShell.tsx, SideMenuLogoRow.tsx, SideNavRow.tsx        | Same names in cloud/                                                |
| components/page-header/PageBreadcrumbs.tsx, headerButtonStyles.ts                  | Same names in cloud/                                                |
| components/amicited/dashboard/metrics/ui.tsx                                       | Card.tsx, SectionHead.tsx, metrics.tsx (KpiStrip, KpiCell, StatRow) |
| components/amicited/ui/cardFrame.ts, StatusNotification.tsx, AgentBannerHeader.tsx | Same names in cloud/                                                |
| components/amicited/dashboard/status/severityStyles.ts, StatusLevelLabel.tsx       | Same names in cloud/                                                |
| components/amicited/dashboard/metrics/BarRow.tsx, charts/HBar.tsx                  | BarRow.tsx, HBar.tsx                                                |
| components/amicited/AmICitedFreeToolCard.tsx                                       | AmICitedFreeToolCard.tsx                                            |
| components/ui/controlSurface.ts, app/theme.ts button entries                       | controlSurface.ts, buttonStyles.ts                                  |
| components/amicited/onboarding/onboardingStyles.ts                                 | onboardingStyles.ts                                                 |
| styles/amicitedTokens.css, styles/tailwindShared.css palette                       | amicitedTokens.css, sharedTokens.css                                |

Navigation and data hooks become desktop props; translations become plain strings.
Tool cards retain desktop link semantics. Flowbite controls have small native
equivalents using the source classes. Cloud-only account menus, sub-app rail,
card maximizing and historical chart controls are omitted; local checks have no
historical data. Domain text and group-label classes come from
AmICitedDomainSwitcher.tsx and SideNavGroup.tsx respectively. The desktop header
uses the shared PageBreadcrumbs trail. Its New task leaf is plain text because
the upstream task form already owns the page heading.

The shell uses Inter, as BrandingProvider does in the cloud. Content opts into
Geist with `data-amicited-font`; figures use Geist Mono. The token stylesheet is
copied verbatim and scoped by `data-amicited-tokens`. Inter and Fraunces bytes
match the export; Geist files retain their bundled npm provenance. Tailwind scans
the port directory explicitly. Shared gray-900 is scoped through a shell variable
to preserve the developer palette; the remaining shared palette literals are
unchanged. Developer mode mounts no marketer shell.

The computed-style evidence in [parity/computed-styles.md](parity/computed-styles.md)
compares rendered desktop elements with isolated specimens of the cloud classes
using the ported token stylesheet. It is not a live-cloud comparison. Chromium
CDP records the face used, and font checks require loaded FontFace objects.
The journey captures 2× pixels at 1344×1016 and the regular 1440 viewport.

`marketing.css` retains desktop-specific task, local report, preferences and
upsell layout plus the T3 token bridge. Results expose only measured figures;
free local tools and their complete results never depend on a cloud account.
