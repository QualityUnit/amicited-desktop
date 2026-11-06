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
