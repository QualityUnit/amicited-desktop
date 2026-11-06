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
Tool cards retain desktop link semantics. Controls use the injected T3 Button, Input and Textarea; AmICited variants own their cloud geometry and token colors. Cloud-only account menus, sub-app rail,
card maximizing and historical chart controls are omitted; local checks have no
historical data. Domain text and group-label classes come from
AmICitedDomainSwitcher.tsx and SideNavGroup.tsx respectively. The desktop header
uses the shared PageBreadcrumbs trail. Its New task leaf is plain text because
the upstream task form already owns the page heading.

The shell and dashboard content use Inter, as BrandingProvider does in the cloud.
Onboarding explicitly opts into Geist; figures use Geist Mono. The token stylesheet is
copied verbatim and scoped by `data-amicited-tokens`. Inter and Fraunces bytes
match the export; Geist files retain their bundled npm provenance. Tailwind scans
the port directory explicitly. Shared gray-900 is scoped through a shell variable
to preserve the developer palette; the remaining shared palette literals are
unchanged. Developer mode mounts no marketer shell.

The computed-style evidence in [parity/computed-styles.md](parity/computed-styles.md)
uses an independent document compiled from the exported cloud components and
cloud stylesheets. The fixture replaces routing/translation and inactive service
hooks, uses the real Flowbite custom theme, and never clones desktop DOM.
Each row names its source declaration, measures light and dark, and records
unequal properties. Typography crops and journeys are captured at 2×.
Electron verification runs the built main with its own OS home, T3 home and
ports; CDP selects the application target, excluding DevTools. No native font
result is inferred from Chromium.

The trends card, tabs and legend preserve the cloud structure and keyboard
roles. Local checks supply measured snapshots instead of historical series or
period deltas. Static KPI summaries derive columns from populated children and
suppress empty strips. Tools use one enclosing hairline grid; cloud explainers
use variable-height rows. Fraunces appears only on the welcome headline.

`marketing.css` retains desktop-specific task, local report, preferences and
upsell layout plus the T3 token bridge. Results expose only measured figures;
free local tools and their complete results never depend on a cloud account.

The visibility answers use the cloud `ui/signalRow.ts` grid and hairlines, with
answer text and citations in a disclosure. Answers decode against the tool's
shared browser-safe schema. Tools tabs use the `TabStrip` label geometry, while
New task uses the cloud warning-tone Ask agent treatment with a working ⌘J.
Export uses the injected T3 menu and button controls. Search is marketer-only:
the authenticated tool registry, latest session result and saved tasks; its
sidebar entry and ⌘K open the same modal in first-run and subsequent shells.
The comparison table also measures the banner, search row, domain control,
finding badge, signal row and tool tab. Differences are recorded, not hidden.

Reference transitions are disabled before theme measurements, and CDP records
the used text faces on both sides. Matched labels are measured separately from
component geometry.
Sidebar and tool-group icons use the cloud’s Tabler paths. Numeric report values
and answer positions use Geist Mono. The small tint Badge, 40px Inter tabs, domain selector, signal rows and compact
48px disclosure summaries follow the exported cloud source. Search ports the
ReportSearchBox header, groups, footer and blurred top-aligned backdrop, with
arrow selection and Enter activation. Recent results show their score and time;
the corresponding tool is omitted. The visibility offer describes the measured
brand result and lists unchecked assistants, leaving methodology in the report.
