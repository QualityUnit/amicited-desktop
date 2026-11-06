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
