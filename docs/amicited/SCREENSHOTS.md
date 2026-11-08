# Chat-first journey captures

With Node 26.12.1 and the workspace dependencies installed:

```sh
node scripts/amicited/journey-screenshots.ts .amicited-shots/r19
node scripts/amicited/electron-screenshots.mjs .amicited-shots/r19
```

The browser harness owns temporary state and independently allocated ports,
pairs Chromium and captures at deviceScaleFactor 2: light/dark 1344×1016 and
light 1440×900. It covers the empty chat, website context, a free Replay marketing
turn, the compact result and inline trial offer, full result, recent chats,
Tools, AmICited and Settings. Developer-mode empty chat and Replay showcase
captures supply the T3 reference. `browser-fonts.json` records loaded faces.

The native harness runs the existing built Electron main with its own OS home,
T3 home, Chromium profile and port offset; it captures the empty chat and
marketing turn in both themes. `electron-fonts.json` records native font loads.
It never invokes dev-electron.mjs or touches the developer's live state.

The marketing Replay fixture is controlled evidence, not a live website audit.
It spends no subscription allowance. Both harnesses stop only their own children.
Private stack logs can contain pairing URLs and must not be published. All
captures are ignored by Git. Dashboard parity specimens are retired.

Set `AMICITED_REAL_PROVIDER=1` on the browser harness to additionally enable the
logged-in Claude provider in its isolated T3 home, run one Haiku website
audit, and save `real-provider-transcript.txt`, the real result JSON and captures. This deliberately
uses subscription allowance. Default runs remain free. Additional scenarios
cover terminal failures, pending approvals, the website popover, collapsed
navigation and returning a result question to its originating chat.

Wave 20 verifies the real Haiku → marketing_tools_run → seo.site.audit path
against example.com using the normal user HOME and isolated T3 state. The
captured audit returned 41/100. Recovery-card captures are component fixtures,
not a claim that this authenticated turn failed. Capture styles disable
transitions before every theme capture.

To reuse a stopped journey home for native evidence, run the journey with
`AMICITED_KEEP_HOME=1`, then set `AMICITED_CAPTURE_HOME` to the path in the
private `isolated-home.txt` for the Electron harness. This renders the same
persisted real audit. Do not run both servers against that home together.

Wave 21 adds scoped report dispatch in Electron (`electron-outgoing-context.json`),
router category navigation, a non-audit approval, a sidebar row menu and keyboard
navigation. `real-provider-events.json` records the completed persona turn.
Use `AMICITED_REUSE_REAL=1` with `AMICITED_CAPTURE_HOME` and `AMICITED_KEEP_HOME=1`
to recapture that stopped turn without paying for another request. The recovery
scenario runs through the provider protocol and persists a failed run; it no
longer mounts a detached recovery component. The real result may contain several
cards because the assistant chooses its checks.

Wave 22 captures go in `.amicited-shots/r20/`. The journey additionally cancels
a deletion, archives and restores a chat, and asserts route, theme and absence
of the boot screen before captures. Fresh-chat evidence explicitly opens a new
chat. The fetched example.com HTML is retained in `example-com-fetch.json`:
this response contains no H1, so an empty H1 finding is expected for that fetch.
Account-backed production cloud authentication and an agent-issued paid MCP call
remain unverified until an account is available.

Wave 23 uses `.amicited-shots/r21/`. Additional states cover the initial quiet
Thinking line, readable sidebar statuses, the anchored website editor, marketer
delete copy, and populated/empty archives. The recovery browser test drives the
real component through failed authentication, readiness and retry; interactive
subscription sign-in itself is represented by its boundary. Scored prioritization
evals require API credentials; the real subscription turn is separate evidence.

Wave 24 uses `.amicited-shots/r22/`, including the controlled Partial coverage
card (`03c-partial-coverage`) and the persisted Sign in needed sidebar row.
Every failed-tool theme/viewport capture awaits the actual failure transcript;
real-turn captures await the marketing result card. The real Haiku turn uses
the normal user HOME with isolated T3 state. Browser and Electron captures reuse
that stopped state; `capture-head.txt` identifies the commit rendered.

Wave 25 uses `.amicited-shots/r23/`. The reference set includes developer empty
chat, tool work log, populated sidebar and Settings in both themes and the 1440
journey. Native captures record the marketer and developer computed font family,
size, line height and text colour for sidebar, breadcrumb, composer and timeline
in `style-parity.json`. System font availability is checked through `document.fonts`;
the retired dashboard font files are no longer loaded.

Wave 27 uses `.amicited-shots/r25/`. The integrated collapsed rail checks all
three footer destinations. Browser and Electron journeys use the native category
control and list groups; Electron also captures Settings. `style-parity.json`
includes padding, dimensions, border widths and radii for composer, sidebar row,
header and equivalent native work-log buttons, alongside typography, background, translation, context-line and outer selection measurements. Archive captures restore through Settings rows; native evidence includes a failed tool and seeds the website context.

Wave 29 uses `.amicited-shots/r27/`. The journey includes outlined starters,
the exact composer model and native picker, plus controlled connection-tool
results with visible and hidden offers. `macos-controls-layout-proof.json`
compares marketer and developer title-bar controls and brand insets in the same
Electron window, including its drag region. This is computed-layout evidence;
renderer screenshots omit native macOS traffic lights. Evals need the API key
or proxy described in `evals/mcp-tool-use/README.md`; missing credentials do not
count as a scored result.

The harnesses set `T3CODE_DEV_REPLAY_CAPTURE=1` so recorded thinking and
pending-tool intervals last long enough for the three theme/viewport captures.
Normal Replay timing stays unchanged.

Wave 30 evidence is in `.amicited-shots/r28/`. The production OAuth transcript
records discovery, public-client registration, S256, resource, all three scopes
and AmICited branding; verification stops at the FlowHunt login without forms.
The journey captures the shared settings connection surface and native model
picker. Controlled component states are explicitly separate from account-backed
production access; free discovery cannot establish a workspace plan.

Wave 31 uses `.amicited-shots/r29/`. The `marketing-cloud` Replay scenario
persists discover → free_site_health_start → free_site_health_get in the normal
chat pipeline. It uses `request.target` for start and `run_id` for get. It is
controlled Replay evidence, not production execution. Connection-state captures
update the dev-only connection store and render the real Settings page; no
standalone connection component is mounted over the page.

Native reuse of a real Haiku turn requires `AMICITED_REUSE_REAL=1`; reusing a
free Replay home does not assume an account-backed run exists. Native cloud
settings states use the same controlled dev event as the browser journey.

Wave 32 uses `.amicited-shots/r30/`. The browser harness points the cloud service
at a loopback-only fake MCP endpoint and passes `--live-cloud` to Replay. Its
cloud scenario calls T3's actual MCP proxy and waits for the app approval before
persisting the returned result. Live waiting, connected-after-refresh, free and
paid approval, and subscription-refusal captures have distinct names; the older
Settings evidence fixtures remain labelled separately. No production account is
used. `AMICITED_CAPTURE_OAUTH=1` on the native harness routes the browser-open
boundary to an isolated capture browser and attempts a FlowHunt login capture
without submitting forms, then cancels in the app. If the boundary cannot be
reached, `production-oauth-boundary.json` records that limitation.

Wave 33 uses `.amicited-shots/r31/`. Live cloud evidence includes inline credit approvals, a read-only chat grant, and provider-shaped brand visibility with start/poll consolidation. `AMICITED_CAPTURE_OAUTH=1` records the redacted authorization URL after the production browser launcher succeeds; it opens the real browser and cancels without submitting a form. It no longer substitutes a launcher shim. Explicit Replay capture holds long recorded states for thirty seconds to allow all three viewport captures under host load.

`AMICITED_SKIP_REPORT_PROBE=1` scopes the native harness to its UI and cloud captures without sending the separate report-question follow-ups. Report dispatch remains covered by the full browser journey; report a scoped native run as such.

Wave 36 uses `.amicited-shots/r34/`. The website-editor capture now shows the
New domain dialog. Native evidence adds the 48px rail with the upstream floating
control, reopen by click/history/shortcut, two domain groups and persisted chats,
the disconnected warning, and Settings → Domains. The same-account captures use
an isolated loopback MCP fixture and test-only workspace keys; they do not imply
production account access. Native title-bar clearance is measured in Electron;
renderer captures omit the macOS traffic lights.

Wave 37 uses `.amicited-shots/r35/`. Collapse hides the entire sidebar; its
control renders after the main content to preserve Electron's native hit region.
`collapse-result.json` identifies the click method and records the topmost-element
and DOM-order drag-region checks. macOS Accessibility privileges are required
for an OS click; CDP clicks alone do not prove native hit testing. Domains
settings captures include compact disconnected, connected and account-reuse rows,
with trial and API-key details in a native dialog.

Wave 38 uses `.amicited-shots/r36/`. Run the normal browser and Electron journeys
for the preceding evidence set. `AMICITED_CAPTURE_SITE_FILES=1` on the browser
journey adds CMS, detected folder, sidebar, Settings and local-bare-repository clone
captures. Site-edit evidence uses the free Replay showcase approval; the capture
harness applies the proposed fixture-file change after approval so the normal
checkpoint service and diff UI observe a real disk change. This is controlled
fixture evidence, not an actual model editing a production site.
