# AmICited visibility engines and the user's browser

AmICited checks AI answers (Perplexity, ChatGPT, Gemini, Google AI Overviews and AI Mode)
from the user's own computer, once a day, in the browser they already use, with their own
sign-ins. The engine code is in `packages/amicited-visibility`; the server side is in
`apps/server/src/amicited/browser` and `Tracking.ts`; the extension is `apps/amicited-connector`.

## Why a companion extension

The browser must be the user's default browser with their real profile. These do not work:

- **Remote debugging of the real profile.** Chrome 136+ ignores `--remote-debugging-port` and
  `--remote-debugging-pipe` on the default user data directory. Chrome 144's
  `chrome://inspect` toggle asks for consent on every connection, so it cannot run unattended.
  Firefox only starts its remote agent at launch, so it cannot attach to a running browser,
  and remote control sets `navigator.webdriver`, which bot checks look for.
- **Copying the profile.** Cookies are encrypted with OS keys (and app-bound on Windows),
  Google binds session cookies to the device (DBSC), and rotating refresh tokens make a
  copy sign the user out of one side.
- **`--load-extension`** is ignored by branded Chrome since 137.

So the user installs the AmICited Connector from the Chrome Web Store (Chrome, Edge, Brave,
Arc, Vivaldi, Opera) or addons.mozilla.org (Firefox). It works whether the browser is already
open or not, needs no restart, and runs in an ordinary tab with no automation flags.

The extension dials a loopback WebSocket, `ws://127.0.0.1:47615/connector`
(`AMICITED_BROWSER_BRIDGE_PORT` overrides the app side). The bridge accepts only
`chrome-extension:`, `moz-extension:` and `safari-web-extension:` origins, which web pages
cannot forge; local processes can, but they already run as the user. A loopback socket was
chosen over native messaging because it needs no per-browser host manifest or registry
entry and works from snap and flatpak browsers.

## Trade-offs to keep in mind

- **Store policy forbids remote code.** The extension can only run page scripts it ships.
  Engines put in-page code in `pageScript(name, fn)` functions; Playwright evaluates the same
  function, and the extension runs its bundled copy by name. A new or changed script needs
  an extension release, and the bridge refuses scripts the connected extension lacks. Selector
  changes need only an app release. This narrows the specification's "adapters updated over
  the air".
- **Page scripts are self-contained.** Both drivers serialise them, so they cannot use outer
  variables. The server has no DOM types, so scripts use `PageWindow` from `page.ts`.
- **Input is synthetic in the extension.** Text goes in through `execCommand("insertText")`,
  which editors accept as trusted, but Enter and clicks are untrusted events. Prefer a
  submit button selector or a URL that carries the prompt.
- **Background lifetime.** The Chromium build is MV3: a 20-second ping keeps the service worker
  alive while connected, and an alarm reconnects every 30 seconds. The Firefox build is MV2
  with a persistent background page.
- **Visible windows.** Checks run in an unfocused window that the extension owns. It reuses
  that window between asks and closes it after a minute idle, so the user's tabs are never
  touched. There is no headless mode for signed-in profiles, as the specification requires.

## Choosing the browser

`BrowserSessions` picks a driver for every page:

1. The connected connector, whichever browser it is in.
2. Otherwise, if a check has run through the connector in the default browser's family, the
   app opens the default browser on the bridge's landing page and waits up to 45 seconds.
   The extension takes that tab over for the first ask.
3. Otherwise the AmICited browser (the Playwright `connections` profile), which needs
   separate sign-ins. `BrowserSessions.mode` gives the reason in plain words.

The default browser comes from `xdg-settings` on Linux, the LaunchServices handlers on macOS,
and the `UserChoiceLatest` or `UserChoice` ProgId on Windows. Safari has no connector:
its extensions ship only inside a signed macOS app, and `safaridriver` cannot use the user's
profile, so Safari users get the AmICited browser. Disconnecting a site clears cookies only
in the AmICited browser; the app never signs the user out of their own browser.

## Runs

`Tracking` asks in prompt-major order, so consecutive asks go to different sites. It waits
3 to 8 seconds between asks and at least 15 seconds between asks to the same site, and runs
one ask at a time. A failed ask is retried once after 20 to 40 seconds. A CAPTCHA or sign-in
wall stops that site for the rest of the run and raises a Connections Issue; two failed asks
in a row also stop the site. A run never loops on a site that needs the user.

Each prompt runs once per day per engine at `TrackingConfig.time`. A slot missed while the
computer was off or asleep runs once on the next tick, and older missed slots are recorded
as missed. Runs are persisted before they start, so a day never runs twice.

## ChatGPT

- **Two front ends.** Signed-out visitors get a server-rendered page (`li[data-message-role]`,
  citation pills are buttons without URLs); signed-in accounts get the React app
  (`[data-message-author-role]`, pills are links). The engine's page scripts read both. The
  signed-out page keeps each answer's markdown, with every citation URL in order, in a hidden
  `conversationState` input, which is filled a few seconds after `data-message-complete`.
- **Titles need clicks.** The signed-out Sources panel lists only each pill's first source, so
  the engine opens every pill and the Sources panel and reads the titles they show.
- **Prompt in the URL.** `https://chatgpt.com/?temporary-chat=true&q=…` opens a fresh chat and
  sends the prompt, with no synthetic typing; prompts over 1,500 characters are typed.
  `temporary-chat` keeps checks out of a signed-in user's history and is ignored signed out,
  where no history is kept. Nothing is deleted afterwards.
- **Search is ChatGPT's choice.** The engine does not force web search, so the answer is the
  one the user would get; `webSearch` records whether ChatGPT searched (the "Searching the
  web" phase, citation pills or a Sources button).
