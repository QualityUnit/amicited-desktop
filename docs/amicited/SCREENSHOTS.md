# Chat-first journey captures

With Node 26.12.1 and the workspace dependencies installed:

```sh
node scripts/amicited/journey-screenshots.ts .amicited-shots/r17
node scripts/amicited/electron-screenshots.mjs .amicited-shots/r17
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
logged-in Claude provider in its isolated T3 home, run one Haiku readability
check, and save `real-provider-transcript.txt` plus a capture. This deliberately
uses subscription allowance. Default runs remain free. Additional scenarios
cover terminal failures, pending approvals, the website popover, collapsed
navigation and returning a result question to its originating chat.
