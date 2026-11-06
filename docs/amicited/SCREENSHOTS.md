# Marketer journey captures

Use Node 26.12.1 with workspace dependencies installed:

```sh
node scripts/amicited/journey-screenshots.ts .amicited-shots/wave0
```

The script launches the actual server and Vite dev stack without file watchers with an explicit temporary home,
disables live-data seeding, requests unused ports from the OS, pairs headless Chromium,
and captures each step in light and dark at 1440×900 and 1280×800:

1. `01-first-launch`: website-first, account-free setup.
2. `02-website-and-ai`: saved website and actual AI subscription readiness.
3. `03-first-win`: completed website health audit using `seo.site.audit`, including partial check coverage.
4. `04-home`: brand, Ask box, quick actions and recent result.
5. `05-tools-grid`, `05b-cloud-capabilities`, `05c-cloud-explainer`: free tools and optional cloud tracking.
6. `06-ai-visibility`: honest needs-provider result with installed assistants disabled.
7. `07-content-result`: local readability result.
8. `08-new-task`: empty task composer, then creation of a draft.
9. `09-amicited-connect`: disconnected connection panel.
10. `10-api-key-disclosure`: expanded workspace-key controls, without credentials.
11. `11-settings-general`: connection panel above brand settings.
12. `12-developer-mode`: upstream settings and developer navigation.

`03b-first-win-upsell` scrolls below the complete free result to show its offer.
The disconnected harness never connects to the production MCP endpoint.

Files carry theme and viewport suffixes, for example `04-home-dark-1280.png`.
Set `AMICITED_JOURNEY_QUICK=1` to capture only light at 1440×900.

Chromium must be installed in Playwright’s normal cache. The harness depends on
the existing scripts workspace’s playwright-core; it adds no browser dependency.

All output is ignored by git. The private `dev-stack.log` may contain a one-time
pairing URL; do not upload it. The harness closes its browser, signals only the
server and web processes it spawned, and deletes its temporary
home on exit. It never reads or writes `~/.t3`. Add future journey steps before
the finally block, using accessible locators and explicit readiness conditions.

The r2 journey keeps these filenames for comparison. Continue now runs the audit
immediately, so `02-website-and-ai` records that result rather than an intervening
setup step. `02b-provider-sign-in` opens direct Claude setup and
`02c-provider-ready` records readiness and the saved generation selection.
`06-ai-visibility` restores a disconnected fixture; `06b-visibility-result-fixture`
uses a labelled successful visibility fixture. Neither invokes generation. `06c-fix-with-ai-task` follows the missing-brand action to its prefilled task.
`08b-task-draft`, `08d-task-reply-replay` and `08c-tasks-list` capture the draft,
a free Replay reply and two saved tasks. Quick mode also captures dark 1440
for 01, 03, 04, 06 and 06b. Step 06 now shows the successful visibility fixture;
06a preserves the disconnected state. The connected cloud summary remains covered by the local MCP
fixture tests rather than a production connection.

The r3 journey also captures `04b-subscriptions` in both themes, asserts Claude in
the review draft, and sends the New task form through Replay without a second
composer submission. Quick mode includes dark 02, its connection states, and 09.

The r4 journey adds `04c-no-assistant`: Home Ask preserves its prompt and shows
an inline connection message. Connection captures scroll the setup card into view;
ready selection collapses it to the In use chip. After the connection captures,
the harness verifies that permanently hiding trial offers confirms the saved choice
and suppresses Home's promotion. Quick mode retains the r3 theme coverage.

The r6 quick journey also captures `03-first-win`, `04-home`, `05-tools-grid`,
`06-ai-visibility` and `08c-tasks-list` at 1344×1016, matching the cloud reference
CSS viewport. These `*-light-1344.png` files support side-by-side shell and report
comparison. Completed onboarding uses the shared workspace; visibility includes
only current-run bars, with no invented history. The journey asserts that Tools
also suppresses promotional explainers after permanently hiding trial offers.

The r7 quick journey adds `03b-first-win-upsell`, `09-amicited-connect` and
`04d-sidebar-collapsed` at 1344×1016. It reloads after collapse to verify that the
rail preference survives, then expands it before continuing. The audit shows the
first three prioritized findings, followed by the offer and an All findings
disclosure; visibility bars and legend share ranked series colours.

The r8 journey adds `07b-second-run` at 1344×1016 and 1440×900. It opens
Run again after a successful readability check, changes the source copy, runs the
real local tool again, and then verifies Edit inputs retains that revised copy.
The same-width parity set retains Home, Tools, visibility fixture, audit, offer,
Tasks, connection and collapsed sidebar views. All visibility fixtures remain
explicitly labelled and never invoke paid generation.

The r9 journey distinguishes Run again (immediate same-input run) from Edit inputs,
checks Tools disclosure persistence, and adds labelled `07c-writing-fixture` and
`07d-keywords-fixture` captures at 1344 and 1440. Readability is also captured at
1344; Home and audit gain dark 1344 counterparts. Each connection capture waits
for its Connect button after switching theme to exclude transient splash screens.

Wave 13 sets deviceScaleFactor 2 for every capture, including the 1344×1016
parity set. The harness asserts loaded Inter, Geist, Geist Mono and Fraunces
faces, writes browser-fonts.json and computed-styles.json, and saves typography
crops under crops/. The computed-style writer also generates the committed
parity table in docs/amicited/parity/computed-styles.md. Native Electron results
are recorded separately; a browser font check does not prove native loading.

Wave 14 replaces class clones with actual cloud-source specimens. Before running
the journey, set `AMICITED_CLOUD_SOURCE` to the exported flowhunt2 frontend/src
and `AMICITED_CLOUD_DEPS` to an isolated npm prefix containing `esbuild`,
`flowbite-react`, `@floating-ui/react`, `react-icons`, `react`, `react-dom`,
`tailwind-merge`, `d3-array`, `d3-scale`, `clsx` and `lodash`. These are evidence
build dependencies, not application dependencies. Build the independent document:

```sh
node --input-type=module -e 'import {cloudSpecimens} from "./scripts/amicited/cloud-specimens.mjs"; await cloudSpecimens(process.cwd()+"/.amicited-shots/r12")'
AMICITED_JOURNEY_QUICK=1 node scripts/amicited/journey-screenshots.ts .amicited-shots/r12
node scripts/amicited/electron-screenshots.mjs .amicited-shots/r12
```

The journey additionally crops the upsell on its own and captures dark visibility
at 1344. Electron captures Home, the real website audit and labelled visibility
fixtures in both themes at 2×, with loaded-face assertions in electron-fonts.json.
The native harness uses the existing built main and runtime directly, never the
pattern-killing desktop dev launcher. It overrides the temporary process's OS home
because DesktopUserData resolves the macOS profile independently of the Chromium
user-data switch. CDP uses localhost and selects the application page explicitly;
DevTools is also a page. First-run shell markers can be nested.

Wave 15 adds `04e-search-open` and `06d-visibility-upsell`, and follows a search
result into the actual audit route. Tool-grid dark parity also runs at 1344.
Native answer fixtures include every schema field; the harness checks the rendered
excerpt and rejects missing-answer or schema-error states. Both harnesses keep
using isolated state and their own processes and ports.

Wave 16 captures the search with a keyboard-selected row and score/time on the
recent result. The settings form also runs in dark mode, so the input comparison
uses the real T3 field rather than the borderless search input. Reference specimens
use dashboard inheritance, the complete domain control, matching badge severity,
signal contents, viewport and content widths, with transitions disabled. CDP
records used faces on both sides. Owner-facing captures omit fixture prefixes;
the data remains controlled and no paid generation runs.
