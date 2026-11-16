# AmICited extension points

Upstream files change only at small, self-contained extension points listed here.
No patch files are required; this supersedes section 2 of the specification.

- `apps/web/src/components/chat/ChatHeader.browser.test.tsx`: explicitly selects and restores developer mode for both rename cases.
- `apps/web/src/components/ChatView.browser.test.tsx`: verifies reserved drafts and marketer thread location, branch, PR and machine/provider metadata through the normal app root.

- `packages/client-runtime/src/state/commandPermissions.test.ts`: extends existing grant coverage to marketing runs.
- `packages/contracts/package.json`: dependency on the standalone marketing RPC definitions.
- `packages/contracts/src/clientRpcPermissions.ts`: guards marketing runs with the existing operate scope on clients.
- `packages/contracts/src/rpc.ts`: adds marketing methods to the authenticated WebSocket group, allowing existing clients to use their normal environment connection.
- `apps/server/package.json`: dependencies on local marketing tools and their contracts.
- `apps/server/src/observability/RpcInstrumentation.ts`: declares marketing RPC telemetry namespaces.
- `apps/server/src/ws.ts`: thin list/run handlers call the provider-aware MarketingTools Effect service.
- `apps/server/src/auth/RpcAuthorization.ts`: requires orchestration read for listing and orchestration operate for running tools.
- `apps/web/package.json`: dependencies on marketing UI and tool types.
- `apps/web/src/branding.ts`: sources the marketer-facing product name from one package constant.
- `apps/web/src/components/ChatView.tsx`: reads the shared workspace mode to hide branch controls (except for domains with a git site folder), terminal drawer, and developer panel launchers and mounts marketer composer context in the existing ContextStrip outside Host. On a new chat it mounts the marketer header inside Host, above the composer form, and moves the branch controls into it.
- `apps/web/src/routes/_chat.settings.general.tsx`: provides the reverse switch from developer to marketer mode.
- `apps/web/src/routeTree.gen.ts`: generated route registration for the marketing mounts.
- `knip.jsonc`: declares the scripted screenshot entry points.
- `scripts/lib/third-party-licenses.ts`: treats the fork’s @amicited packages as first-party while retaining their dependency notices.
- `scripts/lib/third-party-licenses.test.ts`: covers first-party exclusion in the existing notice-generation fixture.
- `scripts/release-smoke.ts`: copies the @amicited package manifests into the lockfile-free install fixture; add each new @amicited package there.
- `pnpm-lock.yaml`: workspace importer entries for the new packages and their consumers only.
- `.gitignore`: excludes local journey captures.
- `apps/server/src/telemetry/AnalyticsService.ts`: defaults product analytics to AmICited's PostHog Cloud EU project instead of T3's ingest, and sends nothing while the `usageAnalyticsEnabled` server setting is off.
- `apps/server/src/telemetry/AnalyticsService.test.ts`: provides test server settings and covers the settings opt-out.
- `apps/server/src/server.ts`: gives the analytics layer the shared server settings.
- `packages/contracts/src/settings.ts`: adds `usageAnalyticsEnabled` (default on) to server settings and their patch.
- `apps/web/src/components/settings/SettingsPanels.tsx` and `settingsSearch.ts`: Privacy switch under Maintenance; usage-data copy names the product.
- `apps/web/src/components/onboarding/WelcomeWizard.tsx`: usage-data notice names the product and points to the switch.
- `apps/web/src/legalLinks.ts`: privacy policy is FlowHunt's.
- `packages/amicited-identity`: product identity constants shared by every rebrand; `src/index.ts` is identical on every branch, and each slice adds a sibling file (`src/mobile.ts` for mobile).
- `apps/mobile/app.config.ts`, `eas.json`, `package.json` scripts and `README.md`: AmICited names, IDs (`com.amicited.desktop.mobile*`) and schemes; EAS project, owner, Apple team and Clerk domain come only from `AMICITED_*` env.
- `apps/mobile/src/**` user-visible copy, deep-link prefixes, QR pairing and thread copy: read `@amicited/identity` instead of hard-coding T3 Code, T3 Connect or `app.t3.codes`.
- `apps/mobile/modules/*`: podspec and Gradle metadata, clipboard labels, the notification fallback scheme and thread-link paste detection.
- `apps/web/public/.well-known/*`: list no apps until AmICited hosts a web app domain.
- `scripts/mobile-*`: dev and screenshot harness IDs, schemes and the showcase fixture.
- Brand artwork (binary or SVG replaced in place, same paths; on conflict keep ours and rerun `node scripts/amicited/render-brand-icons.ts`): `assets/{dev,nightly,prod}/**`, `apps/web/public` favicons, `apps/mobile/assets/android-*.png`, `apps/mobile/assets/widget/T3Mark.svg` and `apps/desktop/resources/dmg/dmg-background-*.svg`.
- `apps/web/src/components/T3Wordmark.tsx` and `apps/mobile/src/components/T3Wordmark.tsx`: draw the AmICited bar mark under the upstream export name.
- `scripts/export-android-icons.ts`: the mark's bounding box and safe-zone fraction.
- `apps/web/src/components/ui/standalone-page.tsx`: the lockup next to the mark reads the product name.

New web adapter files (`src/marketing.tsx` and `routes/_chat.{home,tasks,marketing-settings,issues}.tsx`)
only bridge upstream environment RPC, routing and task creation to `@amicited/ui-marketing`.
Home Ask and New task seed the selected assistant and send through the upstream
composer once it mounts. Fix this with AI opens the same composer for review.
The marketer sidebar footer mounts upstream's desktop update pill and architecture
warning, because marketer mode hides the upstream footer that carries them.

## Data, env and service isolation from T3 Code

AmICited must run beside a real T3 Code install without sharing anything. New
values come from `@amicited/identity` (`index.ts`, plus `env.ts` and `policy.ts`).

- Entry points `apps/server/src/bin.ts`, `apps/desktop/src/main.ts`, `scripts/dev-runner.ts` and `scripts/npm-launcher/t3.mjs` (inlined, it ships without dependencies) call `applyAmicitedEnv`: inherited `T3CODE_*` are dropped and `AMICITED_X` is copied to `T3CODE_X`, so upstream readers stay unchanged; the `AMICITED_ENV_MAPPED` marker keeps the values the app sets for its own children.
- Writers that start a fresh entry point use `AMICITED_*`: `apps/server/src/cloud/bootService.ts` (unit and plist), `apps/desktop/src/app/DesktopCliShim.ts`, `packages/ssh/src/tunnel.ts`, `apps/server/src/cli/service.ts` and `apps/server/src/serviceLauncher.ts` (`service.env`), `apps/desktop/src/shell/DesktopShellEnvironment.ts` (login-shell names), and the scripts that launch the app (`scripts/amicited/*`, `scripts/smoke-*.ts`, `scripts/profile-startup.mjs`). `apps/desktop/scripts/electron-launcher.mjs` and `apps/desktop/src/backend/DesktopBackendConfiguration.ts` (WSL) forward the marker. `apps/server/src/terminal/Manager.ts` strips `AMICITED_*` from terminals as it strips `T3CODE_*`.
- Data home `~/.amicited`: `apps/server/src/os-jank.ts`, `apps/desktop/src/app/DesktopStatePaths.ts`, `apps/server/src/cli/browser.ts`, `packages/shared/src/devHome.ts`, `scripts/dev-runner.ts` and `apps/server/scripts/migrate-dev-db.ts` (dev seed source), `apps/server/src/device/*` and `packages/ssh/src/tunnel.ts` (remote hosts), `apps/desktop/src/wsl/DesktopWslEnvironment.ts`, `apps/server/src/project/AgentSessionScanner.ts`, `scripts/install.{sh,ps1}`; project-local `.amicited/vcs.json` in `apps/server/src/vcs/VcsProjectConfig.ts`.
- Electron profile `amicited`/`amicited-dev` with no T3 profile or `Local State` copy: `apps/desktop/src/app/DesktopUserData.ts`; `apps/desktop/src/app/DesktopLegacyLocalStorage.ts` imports no V1 profile.
- Service, slices, IPC, caches, port: `apps/server/src/cloud/bootService.ts`, `serviceProtection.ts`, `apps/server/src/cli/update.ts`, `apps/server/src/process/agentScope.ts`, `packages/shared/src/desktopAppControl.ts`, `apps/desktop/src/compileCache.ts` (with `apps/desktop/vite.config.ts` inlining the identity package into the boot bundle), `apps/server/src/cliCompileCache.ts`, `apps/server/src/config.ts` and `apps/desktop/src/app/DesktopApp.ts` (port 3873).
- Managed policy locations and template identities: `packages/shared/src/managedPolicyFile.ts`, `apps/server/src/policy/policyTemplates.ts`, `apps/server/src/cli/policy.ts`.
- Messages that name an env var say `AMICITED_*`: `apps/server/src/cli/{config,up,automaticPort}.ts`, `apps/server/src/policy/managedLimits.ts`, `apps/server/src/preview/PreviewBrowserHost.ts`, `packages/shared/src/otelEnvironment.ts`, `packages/source-control-bitbucket/src/server/BitbucketApi.ts`.
- `.gitignore`: worktree dev state in `.amicited`. Manifests listed in `scripts/release-smoke.ts` and the consumers' `package.json` files depend on `@amicited/identity`.

## Tools and transports

`@amicited/tools-core` owns definitions, JSON Schemas, registry search and the
bounded runner. Tool modules live in `@amicited/tools`; `MarketingTools` in its
`service` export is the shared server capability. `amicited.tools.list` and
`amicited.tools.run` are authenticated WebSocket RPC methods. Local tools need
no cloud account. Results are returned to the caller; durable history is deferred.

Wave 1A registers MCP tools through `apps/server/src/mcp/McpHttpServer.ts`
and the toolkit/access definitions beside it. Upstream’s MCP toolkits attach
per-tool authorization metadata; registration must include those scopes and use
the same MarketingTools service. Do not bypass this with a second unauthenticated
MCP server. The registry already derives input/output JSON Schema for this hook.

The Promise-based portable runner and Node TLS adapter deliberately use native
clocks, cancellation and timers; their package tsconfigs disable the Effect-only
diagnostics for those APIs. The server service itself follows Effect conventions.

## Product decisions overriding the snapshot

Local use has no AmICited account requirement or sign-in screen. Paid integration
is offered after a first win in a later wave, using
`https://api.flowhunt.io/mcp/amicited` (streamable HTTP, OAuth 2.1 or workspace
Bearer key). Connecting MCP is free, with 12 free tools and discovery for every account.
An optional 7-day trial or Pro at EUR 120 unlocks the full set. Signup:
https://app.flowhunt.io/sign-in?app=amicited&plan=pro&interval=month .

## Wave 1B marketer experience

The fenced role boundary in `apps/web/src/marketing.tsx` owns marketer navigation
and settings routing. It replaces the developer settings surface as a whole;
upstream settings and navigation remain available through Developer features.

- `apps/web/src/routes/__root.tsx`: routes fresh local launches through website setup, returning launches to Home, and suppresses developer onboarding in marketer mode.
- `apps/web/src/routes/_chat.index.tsx`: prevents draft creation on the marketer landing path.
- `apps/web/src/routes/_chat.new.tsx`: empty links open a task composer and invalid links offer recovery.
- `apps/web/src/components/onboarding/WelcomeWizard.tsx`: exports a provider-filtered connection step for direct marketer sign-in.
- `apps/web/src/components/chat/ChatComposer.tsx`: provides the marketer composer prompt and portals website and connection controls to the composer header on a new chat, or to that context strip in a thread; disconnected assistants disable sending.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: friendly subscription label; the existing popup retains advanced model selection.
- `apps/web/src/components/chat/useThreadLifecycle.tsx`: labels completed marketer tasks Done.

Website and brand belong to the domain project in the server-owned metadata store.
Workspace folders and tasks use the existing authenticated project commands. The latest tool result is retained
for the current browser session; durable result history is still deferred.
The completed assistant response mounts the optional compact cloud offer after
the free result and summary. Local
tool results never require a cloud account.

## Wave 1A tools and provider integration

Wave 1A adds these fenced marketing integration seams:

- `apps/server/src/mcp/McpHttpServer.ts`: registers the authenticated marketing discovery/run toolkit with the same service as UI RPC.
- `apps/server/src/mcp/toolkits/marketing/{tools,handlers}.ts`: thin marketing discovery and execution adapters; execution uses scoped capability authorization with live-caller and client-access checks because it can consume the user's AI subscription.
- `apps/server/src/marketing/MarketingToolsLive.ts`: bridges the portable library to the selected provider instance's existing one-shot runner, resolving connection state on each invocation.
- `packages/provider-core/src/server/textGeneration.ts`: optional marketing text capability, leaving unsupported adapters explicit.
- `packages/provider-core/src/server/textGenerationOperations.ts`: exposes full marketing answers through the existing structured one-shot runner (no title truncation, no tools).
- `packages/provider-core/src/server/orchestrationInstructions.ts`: short shared marketing tool catalogue, delivered wherever existing orchestration instructions are injected.
- `packages/provider-opencode/src/server/textGeneration.ts`: admits marketing generation in existing typed error context.
- `apps/server/src/provider/AgentContextBudget.test.ts` and `agentContextBudget.json`: register the provider dependency and account for the catalogue and two MCP meta-tools.
- `evals/mcp-tool-use/run.ts`: imports the real marketing toolkit into the existing eval tool set.
- `scripts/amicited/journey-screenshots.ts`: captures website audit and disconnected AI visibility results in the isolated journey.

The generic marketing result renderer now expands nested results instead of showing
`[object Object]`. Its form omits blank optional values and decodes comma-separated
array inputs so the existing tool cards can submit optional source URLs and competitors.
Wave 1B supplies the marketer layout and result presentation.

Provider-backed tools use the configured text-generation model, with its exact
provider/model identity; they do not silently select another assistant. The shared
runner supports Claude, Codex, OpenCode and Antigravity; drivers without this
capability return `needs_provider`. SERP uses plain fetch to avoid taking over a
user's browser tab; blocked or changed Google layouts are explicit results. Site
checks are basic heuristics, not full standards validators. Sitemap indexes count
child sitemap entries rather than claiming a count of all pages. Visibility has no
live search and ranks only the supplied brand/competitors by first occurrence.

## Cloud connection (Wave 2)

`@amicited/cloud-client` owns the native loopback OAuth/PKCE flow, SDK streamable
HTTP client, workspace-key validation and refresh. The production endpoint is
`https://api.flowhunt.io/mcp/amicited`; tests use a local fake server. Credentials
use the existing `@napi-rs/keyring` dependency, partitioned by server state directory.
The existing ServerSecretStore writes restricted plaintext files, so it is
intentionally unsuitable for these tokens. Keyring failures never fall back to disk.
Workspace identity and plan are not invented from domain names or token contents.
Until the remote response supplies verified metadata, the connected workspace label
is generic and plan is absent. Summary returns normalized domains, raw analytics
and only numeric headline fields actually present; unknown metrics stay absent.

Additional upstream extension points:

- `packages/contracts/src/rpc.ts`: adds the five `amicited.cloud.*` methods from the new package.
- `packages/contracts/src/clientRpcPermissions.ts`: requires settings write for connect and disconnect.
- `packages/client-runtime/src/state/commandPermissions.test.ts`: covers destination grants for cloud connection changes.
- `apps/server/src/auth/RpcAuthorization.ts`: requires orchestration read for status and summary.
- `apps/server/src/observability/RpcInstrumentation.ts`: assigns cloud telemetry and suppresses credential-bearing connection traces.
- `apps/server/src/ws.ts`: forwards cloud RPC to the shared cloud service.
- `apps/server/src/server.ts`: supplies one cloud service to RPC and MCP.
- `apps/server/src/mcp/McpHttpServer.ts`: registers the authenticated cloud proxy toolkit.
- `apps/server/src/ws.test.ts`: supplies an inert cloud client to existing config-stream fixtures.
- `apps/server/src/provider/AgentContextBudget.test.ts`: supplies an inert cloud client for advertised-tool measurement.
- `apps/server/src/provider/agentContextBudget.json`: records the two additional proxy tools (908 bytes).
- `apps/web/src/amicited-cloud.browser.test.tsx`: tests unmounted components with the real web UI kit and asserts the consolidated work-row summary and collapsed technical failure details.
- Server, contracts and web package manifests plus `pnpm-lock.yaml`: add workspace dependencies only.

RPC names: `amicited.cloud.status`, `amicited.cloud.connectOAuth`,
`amicited.cloud.connectApiKey` (`{apiKey}`), `amicited.cloud.disconnect`,
`amicited.cloud.summary`. Connection methods return the discriminated connection
state, including plain-language errors. Summary returns connection, domains and,
when available, analytics and headlines. OAuth opens the browser on the server's
machine; remote users must complete sign-in there or use a workspace key. A second
connection request sees `connecting`; disconnect cancels the pending callback.

Agents use existing provider-injected local MCP access. `amicited_cloud_discover`
proxies `list_toolsets`, `search_tools` and `describe_tool`.
`amicited_cloud_call` uses a real tool name and arguments. The server reads MCP
annotations; anything not explicitly read-only and non-destructive requires
approval and inherited full-access checks. No cloud token reaches providers.

### Completed mounts

`apps/web/src/rpc/amicitedCloud.tsx` mounts the cloud components through
`apps/web/src/marketing.tsx`. The adapter provides `ui={{Button, Input}}` using
marketing buttons and the web Input, plus a system-browser `openExternal(url)` callback:

- Completed assistant response: `AmicitedUpsellCard` props are `result`
  (`{tool,status,output?}`), `gate`, `ui`, `openExternal`, `onConnect`, optional
  `connected`. Create one stable `createUpsellGate(localStorage, sessionStorage)`
  from `@amicited/cloud-client/upsell`. Successful eligible results claim one
  offer per session; Not now persists seven days, and the AmICited settings action hides offers indefinitely.
  Mount after the final assistant message, once per run. `onConnect` navigates to the connection settings.
- AmICited page, connection slot: `AmicitedConnectPanel` props are
  `connection`, `actions={connectOAuth,connectApiKey,disconnect}`, `onChange`,
  `openExternal`, `ui`. Bind mutations through `createEnvironmentRpcCommand` and
  its destination `permissionAtom`; the server independently enforces settings
  write. Refresh status on entry and summary after connection changes.
- Home: `AmicitedConnectedBadge` props are `connection`, `domains` (domain names),
  optional `headlines` (`{label,value}[]`), `reportLink(): Promise<string>`,
  `openExternal`, `ui`. It renders only when connected. The report-link action
  uses `amicited.cloud.summary`'s optional `reportUrl`, obtained server-side from
  `CloudClient.reportLink`. If absent, reject the action so the badge shows its
  honest error state. No report URL is fabricated.

Browser-safe imports use `@amicited/cloud-client/model` and `/upsell`; the root
export contains Node networking and must stay on the server. The journey
harness captures the integrated mounts; component browser tests cover the UI and
fake HTTP fixtures cover auth. No live provider eval was run.
The existing MCP tool-use eval runner passed a one-case dry run; no paid model
was invoked.

The marketer settings navigation links AmICited to `/marketing-settings`; General
shows a connection status line and a link to the AmICited page. Home shows the cloud summary when connected
and a quiet connection link after a persisted first win otherwise.

## Issues and the daily audit

Issues replace the Tools page. Each connected domain gets one upstream scheduled
task, the daily audit, that walks every AmICited report and keeps that domain's
issues current through three MCP tools. An issue links to at most one thread;
In progress and Ready for review are read from that thread, so only open, done
and dismissed are stored. AmICited tables run their own migration list
(`amicited_migrations`) inside the existing database, because upstream refuses
a recorded migration id whose name differs from its own.

- `packages/contracts/src/scheduledTask.ts`, `apps/server/src/scheduledTasks/Schedule.ts`: optional `catchUp` on fixed-time schedules runs a time missed while the machine was off or asleep once, instead of skipping it.
- `packages/contracts/src/{rpc,clientRpcPermissions}.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/observability/RpcInstrumentation.ts`, `packages/client-runtime/src/rpc/client.ts`: register `amicited.issues.*`.
- `apps/server/src/ws.ts`: thin issue handlers; connecting or disconnecting a domain turns its daily audit on or off.
- `apps/server/src/server.ts`: provides the issues service beside the domain favicons.
- `apps/server/src/mcp/McpHttpServer.ts`: registers `issues_list`, `issue_upsert` and `issue_set_status`; `agentContextBudget.json` records them.
- `apps/web/src/components/chat/ChatComposer.tsx`: mounts the top issues and starter prompts under a new chat and the issue strip in an issue's thread.
- `apps/web/src/components/CommandPalette.tsx`: Open issues replaces Open Tools.
- `packages/contracts/src/ipc.ts`, `apps/desktop/src/{preload.ts,ipc/channels.ts,ipc/DesktopIpcHandlers.ts}`: optional open-at-login bridge so a missed audit runs at startup (XDG autostart on Linux).

## Launch branding

- `apps/web/index.html`: AmICited boot title and splash label, with upstream attribution retained.
- `apps/desktop/package.json`: packaged product name is AmICited Desktop.
- `apps/desktop/src/app/DesktopEnvironment.ts`: AmICited window name with existing stage suffixes.
- `apps/desktop/src/app/DesktopAppIdentity.test.ts`, `apps/desktop/src/app/DesktopPreReadyPlatform.test.ts`: expect the AmICited name in the runtime name, About panel and Linux desktop entry.

## OS identity

The packaged app registers with the OS only under the constants in `@amicited/identity`
(`src/index.ts`, plus OS-only values in `src/os.ts`), so it never replaces, uninstalls or
takes deep links from a T3 Code install on the same machine.

- `scripts/build-desktop-artifact.ts`: app ID, product and artifact names, Info.plist usage text, protocols, Linux package, executable, `StartupWMClass`, maintainer, metainfo and doc paths; the update feed falls back to our repository.
- `apps/desktop/src/electron/ElectronProtocol.ts`, `apps/server/src/httpCors.ts`, `packages/shared/src/{remote,codexAuthHandoff,promptLinks,providerAuthReturnUrl}.ts`: the `amicited` scheme (`amicited-dev`, `amicited-preview`).
- `apps/desktop/src/app/{DesktopEnvironment,DesktopEarlyElectronStartup}.ts`: Windows AppUserModelID and the Linux desktop entry ID.
- `apps/desktop/resources/linux/com.amicited.desktop.metainfo.xml` (renamed), `apps/desktop/resources/installer.nsh`, `apps/desktop/scripts/electron-launcher.mjs`, `native/browser-secret/main.c`.
- `apps/desktop/gnome-extension/*`, `apps/desktop/src/snapShot/{KdeSnapShot,HyprlandSnapShot,GnomeCaptureSetup,LinuxSnapShot,linuxCaptureSession}.ts`: screen capture extension UUID, D-Bus names and helper paths under `~/.local/share/amicited`.

The marketer assistant picker saves the existing environment text-generation setting;
local tools resolve that selection per invocation. Tool inputs survive the connection
detour in session storage. No provider credentials are stored in the browser.

- `apps/web/src/modelSelection.test.ts`: covers selection of Claude for marketing generation when the saved default is Codex.
- `apps/web/src/amicited-cloud.browser.test.tsx`: supplies useful audit output to the existing successful-offer fixture.

## Marketer design scope (Wave 4)

- `apps/web/src/marketing.tsx`: supplies upstream Button, Input and Textarea through the portable UI context, only inside marketer mode and first run, and injects T3 work-log disclosures, breadcrumbs, settings groups/rows and category controls into the portable marketing UI.
- `apps/web/src/rpc/amicitedCloud.tsx`: uses the same injected Button for cloud controls and supplies native Collapsible and SettingsGroup to account connection controls.
- `apps/web/src/amicited-cloud.browser.test.tsx`: checks the actual marketer scope and developer-mode exclusion.
- `scripts/amicited/journey-screenshots.ts`: waits for bundled fonts and captures first-run and successful visibility dark states.

There is no upstream Card component in this checkout; marketer cards and section
heads remain semantic containers. Existing Switch, task composer and provider
connection primitives inherit T3’s tokens. No upstream UI-kit variants remain.

## Marketer task handoff and copy

- `apps/web/src/hooks/useHandleNewThread.ts` and its test: optional model selection and immediate-send intent seed an empty draft before navigation.
- `apps/web/src/components/ChatView.tsx`: hands an explicit marketer send intent to the existing composer send operation.
- `apps/web/src/components/chat/DraftHeroProjectHeading.tsx` and `DraftHeroHeadline.tsx`: gate task wording and the no-project escape on workspace mode.
- `apps/web/src/components/chat/ChatHeader.tsx`: adds marketer task breadcrumbs, the workspace label and the marketer workspace segment with the existing breadcrumb primitives.
- `apps/web/src/components/chat/ComposerFooterControls.tsx` and `apps/web/src/components/ComposerContextPermissions.tsx`: show the native access selector in marketer mode; server permission enforcement is unchanged.
- `apps/web/src/marketingNavigation.tsx`: routes standalone marketing UI events through TanStack Router.
- `apps/web/src/routes/__root.tsx`: mounts the navigation bridge for both onboarding and the marketer shell.
- `apps/web/src/components/onboarding/WelcomeWizard.tsx`: marketer-only connection progress and readiness copy, suppressing developer setup details.

- `apps/web/src/components/settings/SettingsPanels.tsx`: accepts the marketer/developer switch inside the existing General settings content column.

## Last verified

Wave 9, 2026-11-06. Existing marketer extension files changed:

- `apps/web/src/marketing.tsx`: removes redundant connection text from General settings.
- `apps/web/src/routes/_chat.tasks.tsx`: whole-row task links, status tones and an empty state.
- `apps/web/src/rpc/amicitedCloud.tsx`: shared promotion eligibility, compact promotion rows and connection-page composition.
- `apps/web/src/amicited-cloud.browser.test.tsx`: connected and snoozed promotion regression rows.
- `scripts/amicited/journey-screenshots.ts`: seven 1344×1016 parity views and remembered sidebar collapse.

Focused tests (27), six package typechecks, focused lint and staged hooks passed.
The r7 journey produced 44 captures without an error capture. Upstream developer
components remain intact; these changes stay within the existing marketer mounts.

## Wave 10 verification

Last verified: 2026-11-06. The existing web extension points changed in this wave:
`src/marketing.tsx` renders recent results as measured dashboard rows;
`src/rpc/amicitedCloud.tsx` groups connection controls in one card;
`src/routes/_chat.tasks.tsx` gives pending input precedence in the status tone;
`src/amicited-cloud.browser.test.tsx` proves editing and a second tool run.
`scripts/amicited/journey-screenshots.ts` adds the revised-input run capture.
No server, provider, transport or upstream UI primitive changed.

## Wave 11 parity corrections

- `apps/web/src/marketing.tsx`: passes router hash separately to resolve the active portable tool pack.
- `apps/web/src/rpc/amicitedCloud.tsx`: removes the nested Home promotion divider wrapper.
- `apps/web/src/amicited-cloud.browser.test.tsx`: covers direct reruns, remembered Tools disclosure and visibility handoff context; updates the dark palette expectation.
- `scripts/amicited/journey-screenshots.ts`: captures writing/keyword fixtures and dark 1344 Home/audit, checks disclosure persistence, and waits for connection-page readiness.

## Cloud component port (Wave 13)

- `apps/web/src/amicited-cloud.browser.test.tsx`: loads the real Tailwind stylesheet for shell/token assertions.
- `apps/web/src/index.css`: imports the scoped cloud token stylesheet and registers the marketing component/evidence sources with Tailwind.
- `scripts/amicited/journey-screenshots.ts`: captures at deviceScaleFactor 2 and calls the font/computed-style evidence writer.

All component and typography changes remain in `@amicited/ui-marketing`.
The existing cloud and web adapters retain their behavior and free-tool gating.

## Wave 14 control variants

- `apps/web/src/marketing.tsx`: injects the existing kit primitives/tooltips and command palette callback; keeps assistant-enable error handling compatible with React Compiler.
- `apps/web/src/routes/_chat.tasks.tsx`: adds a compact list heading and opening affordance.
- `apps/web/src/rpc/amicitedCloud.tsx`: selects the dedicated variable-height promotional row layout.

The marketer adapter uses upstream variants. Provider adapters,
contracts and mobile UI retain their existing behavior. Marketer navigation and
results share their web/desktop entry points, including local and remote RPC.

The web marketing adapter supplies the T3 menu to result export and
authenticates the tool registry for marketer search;
its browser test covers sidebar, keyboard, tool, result and task navigation.
The patches/ policy remains an owner decision; this round does not change it.

## Chat-first marketer mode (Wave 18)

This supersedes the earlier dashboard landing and website-first flow above.

- `apps/web/src/routes/__root.tsx`: fresh marketer launches enter chat without website onboarding.
- `apps/web/src/marketing.tsx`: opens an upstream draft in the implicit workspace; supplies recent chats and existing subscription connection.
- `apps/web/src/components/chat/DraftHeroHeadline.tsx`: marketer headline and four starters seed the existing draft store.
- `apps/web/src/components/chat/ChatComposer.tsx`: optional website/connection row; hands a preserved prompt to the selected assistant after connection.
- `apps/web/src/components/chat/ChatHeader.tsx`: marketer New chat title.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: plain assistant name, including the Replay development provider; permissions remain available in the footer when a model has no effort controls.
- `apps/web/src/components/chat/MessagesTimeline.logic.ts`: carries marketing outputs on folded work groups.
- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: shows compact results beneath a folded work group in marketer mode.
- `apps/web/src/components/chat/TimelineWorkEntryRow.tsx`: renders the same card inside expanded tool activity.
- `apps/web/src/rpc/amicitedCloud.tsx`: existing promotion gate in chat and quiet connected chip.
- `apps/server/scripts/dev-replay-agent.ts`: adds a free marketing scenario alongside upstream scenarios.

`marketingChat.tsx` is a thin web adapter to the package-owned result card. The
assistant identity bridge records driver identity separately from instance IDs;
the offer compares friendly assistant names against the measured scope.

- `apps/web/src/components/chat/MessagesTimeline.tsx`: opts marketer mode into keeping marketing-result turns unfolded and shows unclaimed cloud approvals at the timeline end in both modes; developer mode retains upstream folding.
- `apps/web/src/components/chat/useComposerSend.ts`: preserves user text and adds website context separately on the first message.
- `apps/web/src/components/chat/MessagesTimeline.logic.test.ts`: covers keeping results visible and refreshing completed folded entries.
- `apps/web/src/components/ChatView.browser.test.tsx`: extends the existing draft fixture with marketer-mode starters while retaining developer assertions.
- `apps/web/src/amicited-cloud.browser.test.tsx`: replaces retired dashboard assertions with compact-card, result-context and chat-sidebar coverage.
- `apps/web/src/components/chat/ComposerControlsBar.tsx`: friendly disconnected assistant label in marketer mode.

## Chat polish seams

- `apps/web/src/components/Sidebar.tsx`: marketer mode omits project scopes, folders and developer chrome while retaining upstream history, search and actions.
- `apps/web/src/components/sidebar/SidebarThreadRow.tsx`: marketer rows omit Git and worktree metadata.
- `apps/web/src/components/chat/TimelineAssistantRows.tsx`: renders the compact offer after a completed assistant response for its marketing run.
- `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx`: plain-language marketing approval with inspectable original details.
- `apps/server/src/orchestration-v2/ProviderTurnStartService.ts`: projects each message’s current website and report context into provider instructions, preserving stored user text.
- `apps/web/src/marketingContext{,.test}.ts`: typed adapter for first-message website context and focused projection coverage.
- `apps/server/scripts/dev-replay-agent.ts`: exposes controlled marketing failure and approval evidence scenarios.

The existing composer, model-picker and work-log seams use reactive workspace mode.
Agent marketing calls provide the calling thread’s model selection to the shared
service; standalone RPC calls continue to use the explicit environment default.

## Wave 20 review fixes

- `apps/web/src/components/chat/ThreadNow.tsx`: suppresses message-sync chrome in marketer mode.
- `apps/web/src/components/chat/ThreadErrorBanner.tsx`: suppresses the duplicate sign-in banner when the transcript offers recovery.
- `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx`: renders named marketing requests as tool cards with explicit permission buttons.
- `apps/web/src/components/chat/DraftHeroHeadline.tsx`: sends starters through the existing new-draft action.
- `apps/web/src/amicited-cloud.browser.test.tsx`: asserts the failure reason is visible before opening raw details.
- `apps/server/src/marketing/MarketingToolsLive.test.ts`: verifies website and report context projection, including rejected URL schemes.

Existing chat-header, composer, timeline and provider-turn seams preserve T3’s header, distinguish assistant management from sending, and forward the current report and website separately from the user's text. The isolated native capture harness can reuse a stopped journey home to render the authenticated audit without spending another turn.

- `apps/server/scripts/dev-replay-agent.ts`: adds controlled sign-in failure and non-audit approval scenarios for the marketer journey.
- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: names marketing integration groups, hides marketer reasoning and approval timers.
- `apps/web/src/components/chat/TimelineWorkEntryRow.tsx`: presents only the latest marketer authentication recovery and hides reasoning.

Report questions use `marketingContext` with the environment/thread identity, including
hash-routed Electron windows. Dispatch retains the summary until the server accepts
the message, then clears it. History reads shell summaries only. Approval cards require
an unambiguous same-thread/run execution or native request reference.

- `apps/server/scripts/dev-replay-agent.test.ts`: verifies the controlled sign-in failure crosses the real provider protocol.

Wave 22 uses the existing marketer sidebar and timeline seams for hover actions,
archived chat restoration, scoped resend, provider headings and audit-section
folding. `apps/web/src/hooks/useThreadActions.ts` adds an optional forced
confirmation for marketer deletions. `packages/contracts/src/orchestrationV2.ts`
and `apps/server/src/orchestration-v2/ProjectionStore.ts` expose one optional
marketing-check failure flag on shell rows without loading chat items in history.
`evals/mcp-tool-use/cases/marketing.ndjson` exercises direct audit selection and
preservation of the tool's evidence limits using the existing evaluator.
`apps/server/src/provider/agentContextBudget.json` records the measured marketing
catalog/instruction growth; its normal CI budget label still applies.
`apps/web/src/amicited-cloud.browser.test.tsx` follows the marketer details label.

- `apps/web/src/components/ChatMarkdown.tsx` and its browser tests: marketer mode leaves file names as inline code and bypasses workspace file-link detection.
- `apps/web/src/hooks/useThreadActions.ts`: optional marketer deletion copy and action label through the existing confirmation path.
- `packages/contracts/src/ipc.ts`, `apps/web/src/confirmDialog.ts`, and `apps/web/src/components/ConfirmDialogHost.tsx`: optional confirmation action label, retaining upstream defaults.
- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: quiet marketer thinking state until visible answer content, suppressed during approvals.
- `apps/web/src/marketingRecovery.browser.test.tsx`: drives the actual marketer recovery component across the authentication boundary and successful retry.
- `apps/server/scripts/dev-replay/marketing_transcript.ndjson`: gives the controlled marketing scenario an initial thinking interval for capture.

- `apps/web/src/components/ChatMarkdown.permissions.browser.test.tsx`: explicitly selects developer mode for workspace file-action permission cases.

Wave 24 keeps marketing instructions out of developer turns: the existing
`apps/web/src/components/chat/useComposerSend.ts` context seam marks marketer
messages, including those without a website. `@amicited/tools-core` supplies
marketing guidance only for that context; the generic
`packages/provider-core/src/server/orchestrationInstructions.ts` no longer
contains it. `apps/server/src/provider/agentContextBudget.json` reflects the
smaller developer context. `ProjectionStore.ts` normalizes native MCP result
envelopes in SQL and memory; its existing parity table covers structured and
text-wrapped failures and partial results. The controlled marketing Replay
fixture now supplies partial coverage for UI evidence.

- `apps/web/src/components/ui/sidebar.tsx`: adds the thread row size for a full-width native selection surface with inset content.
- `apps/web/src/components/sidebar/SidebarChrome.tsx`: optional brand slot lets marketer mode reuse the complete T3 header backdrop and height.
- `apps/web/src/components/sidebar/SidebarThreadHeader.tsx`: optional labels and project-action visibility reuse T3 search and icon actions for chats and archives.
- `apps/web/src/index.css`: scans marketer components and registers their aliases to existing T3 tokens; no secondary palette.

The old marketer button/input variants and font/colour overrides are removed.
Marketer approvals use `WorkLogRow` and `ComposerPendingApprovalActions`;
marketing results use `WorkLogButton` and `WorkLogDetails` through the UI adapter.

- `apps/web/src/marketingChat.tsx`: connects report questions and uses composer approval actions.
- `apps/web/src/components/chat/ComposerPendingApprovalActions.tsx`: optional ghost decline control for marketer approvals, preserving the default upstream presentation.
- `apps/web/src/marketingOffer.browser.test.tsx`: supplies the report-question hook at its mocked subscription boundary.

- `apps/web/src/components/AppSidebarLayout.tsx`: shares the existing macOS fullscreen-aware title-bar inset hook with the marketer boundary.
- `apps/web/src/rpc/amicitedCloud.tsx`: accepts connection-tool offers through the existing trial card and persistent promotion gate.
- `apps/web/src/marketingOffer.browser.test.tsx`: extends the existing offer table to connection results and hidden offers.
- `apps/server/scripts/dev-replay-agent.ts`: registers the controlled hidden-offer marketing scenario.

`amicited_connection` uses the existing cloud service and provider-injected local
MCP toolkit. Connected calls name `amicited_cloud_discover` and `amicited_cloud_call`,
which remain attached for Claude and Codex without exposing credentials.
Disconnected calls describe measured visibility and tracking;
connection actions require a first useful local result. The latest marketer
message carries the browser's offer preferences; a hidden or snoozed preference
suppresses suggestions. Existing chats retain their submitted preference until
the next message. Developer messages carry no marketing promotion context.

Wave 30 keeps existing cloud RPC and toolkit seams and adds:

- `apps/web/src/components/chat/ComposerModelEffort.tsx`: marketer footer exposes the native access selector and omits workflow controls.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: hides Replay in production marketer mode.
- `apps/web/src/components/chat/TimelineWorkEntryRow.tsx`: sends cloud tool results through the marketer renderer.
- `evals/mcp-tool-use/run.ts`: includes real cloud proxy declarations in the evaluator.

- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: names completed marketing work from its actual results.
- `apps/server/src/provider/AgentContextBudget.test.ts` and `agentContextBudget.json`: measure the real discovery/call proxy declarations.
- `apps/web/src/amicited-cloud.browser.test.tsx`: exercises shared connect and cancellation without stale completion.
- `scripts/amicited/journey-screenshots.ts`: isolated MCP fixture captures alongside the existing journey.

## Cloud approvals and readable results

- `apps/server/src/ws.ts`, `packages/contracts/src/clientRpcPermissions.ts` and `apps/server/src/observability/RpcInstrumentation.ts`: settings-authorized cloud approval answers and access invalidation; agents cannot answer these through the cloud proxy.
- `apps/server/src/amicited/toolResult.ts`: maps package-owned JSON normalization failures to readable MCP errors and logs the cause.
- `apps/server/src/amicited/CloudToolkit.ts`: delegates approval to app-owned pending requests; ignores model approval flags.
- `apps/web/src/components/chat/MessagesTimeline.logic.ts`: includes cloud calls in compact results outside collapsed work groups.
- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: folds discovery into one compact result.
- `apps/server/scripts/dev-replay-agent.ts`: adds the controlled cloud site-health scenario.
- `apps/web/src/components/chat/ChatComposer.tsx`: starter arrows indicate an in-app action.
- `apps/web/src/components/chat/MessagesTimeline.logic.test.ts`: covers cloud results in the existing completed-turn folding case.

Cloud MCP calls wait up to ten minutes for an app-owned decision and return the
actual result in that same call. Provider runtime responses require a native
provider request, so cloud requests use the bounded-wait fallback. Pending cards
are recovered from the server after remount; restart cancels them safely.

- `apps/server/src/auth/RpcAuthorization.ts`: permits orchestration readers to see pending cloud approvals; answering remains settings-write protected.
- `apps/web/src/components/chat/ChatComposer.tsx`: displays pending cloud requests at the normal composer approval location.
- `apps/web/src/marketing.tsx`: shows Needs your OK for threads waiting on a cloud decision.
- `packages/amicited-ui/src/marketing.css`: the collapsed rail is 48px; the upstream floating toggle keeps the fullscreen-aware native control inset independently of the rail width.

- `scripts/amicited/electron-screenshots.mjs`: disables the viewport resize overlay and compares matching sidebar title elements.
- `apps/web/src/marketingOffer.browser.test.tsx`: supplies the additional cloud adapter exports in the existing isolated mock.

- `apps/server/src/amicited/Cloud.ts`: cancels pending cloud calls on service shutdown and accepts a loopback MCP endpoint only when Replay capture is enabled.
- `apps/server/scripts/dev-replay-agent.ts`: opt-in live cloud capture calls the actual injected MCP tools and persists their returned results.
- `scripts/amicited/electron-screenshots.mjs`: uses the installed Electron binary and optionally captures the production OAuth login boundary in an isolated browser.

- `packages/client-runtime/src/rpc/client.ts`: registers the AmICited approval snapshot stream as a destination-environment subscription.

- `apps/web/src/rpc/amicitedApprovals.tsx`: isolated cloud approval adapter shared by work rows and the timeline fallback; `marketingApprovals.browser.test.tsx` verifies pushed updates and argument matching.

- `apps/web/src/components/chat/ComposerControlsBar.tsx`: pending cloud approvals replace the stale Replay step label with Needs your OK.

## Domain projects

Domain metadata and keyring routing belong to `@amicited/cloud-client` and are
stored separately from upstream project contracts. Domain folders use T3's
existing named-project service under the environment's T3 home. No patch files.

- `apps/web/src/marketingDomains.tsx`: environment RPC adapter, domain creation and project lifecycle controls; uses existing project commands and native dialog/settings components.
- `apps/web/src/marketing.tsx`: groups existing thread shells by domain project ID and shares SidebarProvider visibility with the upstream floating control.
- `apps/web/src/components/AppSidebarLayout.tsx`: exports the existing sidebar control with optional marketer action labels; keyboard/menu behavior is shared.
- `apps/web/src/components/sidebar/SidebarThreadHeader.tsx`: optional new-project label, keeping the upstream icon and tooltip.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.tsx`: optional connection status, actions and New chat label; marketer groups use the upstream project snapshot builder and folder header.
- `apps/web/src/components/DevReplayHost.tsx` and `vite-env.d.ts`: marketer captures prefer the current registered domain over the implicit scratch project. The dev console accepts an explicit runtime mode for permission evidence; its default stays supervised.
- `apps/server/src/project/ProjectService.ts`: optional onProjectDeleted lifecycle hook after the existing project deletion commits, shared by UI and MCP callers.
- `apps/server/src/server.ts`: provides the AmICited domain cleanup implementation through the project lifecycle hook.
- `apps/web/src/components/chat/{ChatComposer.tsx,useComposerSend.ts}` and `marketingChat.tsx`: thread project determines the website context and connection warning.
- `apps/server/src/amicited/{Cloud.ts,CloudToolkit.ts}` and `mcp/toolkits/marketing/handlers.ts`: project-scoped keyring clients and connection-tool status; approvals aggregate through the existing stream.
- `apps/server/src/ws.ts`: domain metadata and connection RPC forwarding, with existing-project validation.
- `packages/contracts/src/clientRpcPermissions.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/observability/RpcInstrumentation.ts`: authorization and telemetry registration; credential-bearing calls are excluded from tracing.
- `apps/web/src/rpc/amicitedCloud.tsx`: domain settings and current-thread promotion actions.

The old browser website migrates into a first named project. The old keyring
credential moves to that first domain; it is cleared only after the destination
write succeeds. A durable migration marker protects later developer connections
from being migrated again. Metadata and local tools remain available if the
keyring is unavailable. Explicit account reuse shares a server-side credential reference
to avoid copying rotating OAuth refresh tokens. Disconnecting one shared domain
detaches it without revoking the other domain's credential. Grants and pending
approvals for that domain's bound threads are released. Starting a different
connection detaches a shared account first and clears the cached remote domain
ID. Chats without a registered domain create one before connecting.

Free discovery does not expose a workspace-domain list. Matching is learned
from a user-approved `list_domains` result, without an extra paid status probe.

- `apps/web/src/components/CommandPalette.tsx`: marketer Tools and AmICited navigation actions alongside the existing Settings action.

- `apps/web/src/components/chat/ChatHeader.tsx`: marketer breadcrumb uses the thread domain hostname.

## Domain CMS and site files

- `apps/web/src/marketingDomains.tsx`: T3 select and native folder picker; folder projects use the upstream project-create command and Git URLs use source-control clone with its existing progress stream and managed projects root.
- `apps/server/src/ws.ts`: authenticated folder-inspection RPC forwards to the AmICited site-files inspector. Metadata saves validate the connected path against the destination project root.
- `packages/contracts/src/clientRpcPermissions.ts` and `apps/server/src/observability/RpcInstrumentation.ts`: settings-write authorization and telemetry for inspection.
- `apps/web/src/components/chat/TimelineAssistantRows.tsx`: marketer changed-files row opens the existing turn diff.
- `evals/mcp-tool-use/run.ts`: CMS fixtures import the production domain instruction rather than copying it.

Folder replacement creates a new domain project. Although ProjectService.update
accepts a root, existing thread working directories and provider sessions may keep
the old path; changing the label alone would misrepresent where agents run.
The Edit domain dialog explains this and the domain menu offers a new domain.
Existing chats, checkpoints, credentials and files stay with the original project.

- `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx`: plain-language marketer edit/command headings alongside the unchanged native approval details and decisions.

`apps/web/src/marketingDomainStore.ts` and `@amicited/ui-marketing/mode` provide
dependency-light readers so project creation does not import the domain UI recursively.

Wave 39 site-file corrections:

- `packages/client-runtime/src/state/threadRequests.ts`: carries the related file-change paths into pending approvals.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.tsx`: prioritizes the hostname when a custom domain status is supplied.
- `apps/web/src/components/ChatView.tsx`: renders upstream diff panels in marketer mode with an explicit Close control.
- `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx`: presents relative file names and compact outline approval actions, with raw details under More.
- `apps/web/src/components/chat/TimelineAssistantRows.tsx`: uses an aligned, underlined Review action.

- `apps/web/src/components/chat/ChatRightPanel.tsx`: accepts optional inline layout controls for the marketer diff close action; `RightPanelTabs.tsx` keeps its inline titlebar-controls reserve when they are passed, so the action sits left of the fixed maximize and panel toggles.

- `apps/web/src/components/DiffWorkerPoolProvider.tsx`: initializes both diff themes so a theme switch cannot render before its theme reaches the workers.

- `apps/web/src/components/RightPanelTabs.tsx` and `components/chat/ChatRightPanel.tsx`: optional add-menu visibility for the marketer review panel.
- `apps/server/src/orchestration-v2/RuntimePolicy.test.ts`: verifies selected access modes remain unchanged for site folders even when metadata is unavailable.

- `apps/web/src/filePathDisplay.ts`: optional workspace-label omission for marketer file rows and approvals, matching the review diff.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.browser.test.tsx`: verifies short hostnames fit at rest and visible status icons and actions do not overlap on hover or focus, for short and long hostnames.

- `apps/web/src/components/chat/MessagesTimeline.logic.ts`: optional folder-label omission for marketer work rows while retaining upstream label selection.

- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: passes marketer folder-label omission to live work-row labels.

## Thread context and sidebar parity

- `apps/web/src/components/AppSidebarLayout.tsx`: optional sidebar content and marketer control labels share the upstream resize rail, width persistence and native title-bar inset.
- `apps/web/src/components/Sidebar.tsx`: optional domain folder renderer, new-domain callback and archive action retain upstream search, keyboard navigation, lifecycle menus and Working/Settled/Snoozed shelves.
- `apps/web/src/components/sidebar/SidebarThreadRow.tsx`: marketer rows retain native metadata and context menus, preserve marketer check/sign-in failures, map cloud approvals to Needs your OK, and accept a site-folder fallback or managed-folder location omission.
- `apps/web/src/components/ChatView.tsx`: marketer chats mount the saved upstream details card and header control only for site folders or linked PRs; managed domains omit Git/editor controls.
- `apps/web/src/components/threadActionMenu.logic.ts` and `hooks/useThreadActionMenu.ts`: linked threads offer Open pull request in both the sidebar and header menus.

- `apps/web/src/components/{Sidebar,AppSidebarLayout}.browser.test.tsx` and `components/ui/sidebar.browser.test.tsx`: cover marketer lifecycle menus and shelves, drag limits and saved width after remount.
- `apps/web/test/fakeEnvironment.ts`: optional shell metadata and socket snapshot refresh support full-app PR, location and recovery fixtures without external calls.

- `apps/web/src/components/chat/{ComposerFooterControls,ComposerModelEffort}.tsx` and `runtimeModeConfig.ts`: marketer composer and model picker expose upstream permissions with the Ask before acting label.
- `apps/web/src/contextMenuFallback.ts`: supports the shared external-link menu icon.
- `apps/web/src/components/chat/ThreadDetailsPanel.tsx`: marketer metadata rows retain location, branch, PR and Review while restricting Git/editor actions to Git site folders.
- `apps/web/src/hooks/useThreadActionMenu.test.ts`: explicitly retains developer wording for the upstream menu permission fixture.
- `apps/web/src/rpc/amicitedCloud.tsx`: cloud link actions use the native link button variant.

- `apps/web/src/components/chat/ComposerPermissionsSection.browser.test.tsx`: verifies the two labelled marketer access choices.
- `apps/server/src/mcp/toolkits/marketing/handlers.test.ts`: covers both access modes and read-only clients.
- `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts`: confirms app MCP tools are pre-allowed in both access modes.

- `apps/web/src/components/chat/useComposerSend.ts`: uses the shared effective composer mode before persisting thread settings and dispatching turns; developer policies remain unchanged.

- `apps/web/src/components/ChatView.tsx`: normalizes saved marketer access at the shared composer boundary for sends, continuations and queued work.
- `apps/web/src/components/chat/useComposerResume.ts`: persists next-turn settings before releasing a held queue, including queue-only resumes.
- `apps/web/src/marketingChat.tsx`: normalizes and saves the access mode before retrying a sign-in failure.
- `apps/server/scripts/dev-replay-agent.ts`: capture-only domain substitution keeps recorded tool rows consistent with the site-folder fixture.

## First-run setup

- `apps/web/src/components/onboarding/WelcomeWizard.tsx`: marketer setup reuses provider cards, the managed ChatGPT flow and the existing Claude installer/login command. Marketer commands run on click; developer setup retains command review.
- `apps/web/src/components/chat/ComposerControlsBar.tsx`: Choose assistant opens the shared setup dialog in marketer mode.
- `apps/web/src/hooks/useHandleNewThread.ts`: marketer scratch requests prefer the last registered domain; explicit domain requests keep their destination.
- `apps/server/src/amicited/Cloud.ts` and `ws.ts`: read/write the small AmICited setup file, outside browser profiles, through authenticated RPC.
- `packages/contracts/src/clientRpcPermissions.ts`, `apps/server/src/auth/RpcAuthorization.ts`, and `apps/server/src/observability/RpcInstrumentation.ts`: setup read scopes and guarded settings writes.
- `packages/client-runtime/src/state/commandPermissions.test.ts`: includes setup writes in destination permission checks.

`marketingSetup.tsx` owns first-run and repeat setup, and `marketingDomains.tsx`
shares the same domain editor across setup, New domain and Edit domain.

- `apps/web/src/components/settings/CodexSetupSection.tsx`: optional marketer presentation names ChatGPT, explains setup state and omits CLI choices while preserving the managed install and browser sign-in path.

- `apps/web/src/components/chat/ProviderStatusBanner.tsx`: hides developer provider diagnostics in marketer mode, where assistant setup and the composer own recovery; developer behavior is unchanged.
- `apps/web/src/components/chat/ProviderStatusBanner.test.ts`: covers the mode boundary alongside existing provider status cases.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: the marketer docked composer uses the provider's full model display name.

- `apps/web/src/components/settings/ProviderAuthenticationSection.tsx`: corrects the shared browser sign-in helper wording.

## Local site previews

- `apps/server/src/amicited/SitePreview.ts` and `mcp/McpHttpServer.ts`: authenticated site-preview tools adapt T3's existing persistent terminal manager, with caller-thread ownership and Full access checks. No separate process manager.
- `apps/server/src/provider/AgentContextBudget.test.ts` and `agentContextBudget.json`: include the terminal adapter and its three advertised tools.
- `apps/web/src/components/ChatView.tsx`, `RightPanelTabs.tsx`, and `preview/agentOpenedPreviews.ts`: retain T3's panel toggle and Browser launcher in marketer mode and reveal agent-opened sites beside chat. `marketingSitePreview.tsx` adapts terminal metadata and existing log/close actions to the marketer status row.
- `apps/web/src/components/ChatView.browser.test.tsx` and `preview/agentOpenedPreviews.test.ts`: cover panel availability, hide/show and automatic browser reveal.
- `evals/mcp-tool-use/run.ts`: includes the site-preview tool definitions in marketer evals.

- `apps/web/test/fakeEnvironment.ts`: provides completed setup state so full-app marketer fixtures reach the chat.
- `apps/web/src/components/settings/ProjectDefaultsSettings.tsx`: optional `showWorkspace` lets the marketer Edit domain dialog reuse the project model defaults without the Local/New worktree row for domains with no site folder.
- `apps/web/src/components/Sidebar.tsx`: in marketer mode each domain folder and its chats render inside one panel `li` so membership is visible.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.tsx`: optional `keepChevron` stops the hover actions from covering the collapse chevron; marketer domain headers set it.

- `apps/web/src/hooks/useHandleNewThread.ts`: marketer new chats resolve domain, environment and recommended assistant defaults before carry-over.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: optional effort suffix for the marketer assistant setup preview.
- `apps/web/src/components/settings/ProjectDefaultsSettings.tsx`: marketer domain model wording and recommended automatic defaults.

## Domain favicons

`apps/server/src/amicited/DomainFavicons.ts` downloads each domain's live `/favicon.ico` once and sets it as the project's existing external `faviconPath` override, so every upstream project icon surface (web, desktop and mobile) shows it without client changes. Icons the user picked, and a reset to Automatic, are kept.

- `apps/server/src/server.ts`: provides the domain favicon service with the runtime services, where project updates are available.
- `apps/server/src/ws.ts`: domain list starts a background favicon sync.
- `apps/server/src/amicited/Cloud.ts`: project deletion also removes the domain's saved favicon.
- `apps/server/src/ws.test.ts`: mocks the favicon service in the shared unused RPC services.

## CI runners

Upstream runs CI on Blacksmith. This repository has no Blacksmith runners, so a job
with a `blacksmith-*` label queues until GitHub cancels it a day later. Workflows we
run use GitHub-hosted labels:

- `.github/workflows/ci.yml`: `runs-on` is `ubuntu-24.04` or `macos-26`; job timeouts are raised for the 4 vCPU hosted runners.
- `.github/workflows/windows-tests.yml`: `runs-on` is `windows-2025`.
- `.github/workflows/release.yml`: `runs-on` and the desktop `runner` inputs are `ubuntu-24.04`, `ubuntu-24.04-arm` or `macos-26`; preflight, test and bundle timeouts are raised. `release-desktop.yml`: the packaging timeout is raised.

Workflows we do not run are also disabled in repository settings. That state is not
in the repository: `gh workflow list --all` shows it, and a workflow that arrives
with a merge starts enabled. After each merge, disable or convert anything new, and
check the files above kept their labels.

The workflows that publish, deploy, or use an outside account no longer target T3's
accounts, and each job is gated in the file as well. A job runs only in
`QualityUnit/amicited-desktop` and only when a maintainer sets its repository
variable to `true`, so enabling a workflow in settings does not start it:

| Variable                           | Workflows                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AMICITED_RELEASES_ENABLED`        | `release.yml` (with `release-desktop.yml`), `publish-aur.yml`                                                                                        |
| `AMICITED_AUR_ENABLED`             | `publish-aur.yml` and the `publish_aur` release job, on top of the releases variable                                                                 |
| `AMICITED_NPM_ENABLED`             | the `publish_cli` release job (and so the Discord announcement), on top of the releases variable                                                     |
| `AMICITED_DESKTOP_PREVIEW_ENABLED` | `desktop-macos-preview.yml`, `desktop-macos-preview-publish.yml`                                                                                     |
| `AMICITED_WEB_PREVIEW_ENABLED`     | `web-preview.yml`                                                                                                                                    |
| `AMICITED_RELAY_ENABLED`           | `deploy-relay.yml`, `relay-preview.yml`, `relay-preview-cleanup.yml`                                                                                 |
| `AMICITED_MOBILE_ENABLED`          | `mobile-eas-preview.yml`, `mobile-eas-preview-fork.yml`, `mobile-eas-production.yml`, `mobile-fingerprint-check.yml`, `mobile-fingerprint-label.yml` |

Inside a release, the hosted web jobs also skip until `AMICITED_WEB_ROUTER_URL`,
`AMICITED_WEB_LATEST_DOMAIN` and `AMICITED_WEB_NIGHTLY_DOMAIN` are set, and the
marketing jobs until `VERCEL_MARKETING_PROJECT` is set. None has a default. The
`relay_public_config` job builds with AmICited Link disabled while the relay and
Clerk variables are unset. Apart from `release.yml` and `release-desktop.yml`, these
workflows still use `blacksmith-*` runner labels; convert them before enabling one.
`pr-vouch.yml` stays disabled.

## Rebranded marketing site and docs

These upstream paths are rewritten for AmICited, not patched at a point. On an upstream merge,
keep our version and port only upstream changes that still apply to AmICited.

- `apps/marketing/**`: AmICited home, download and legal pages; values come from `@amicited/identity`.
- `docs/user/**`, `docs/README.md`, `docs/operations/connect-setup.md`, `README.md`,
  `CONTRIBUTING.md`, `.github/SECURITY.md`, `.github/ISSUE_TEMPLATE/*`,
  `.github/pull_request_template.md`. `LICENSE` adds our copyright line above T3 Tools' notice.
- `docs/user/t3-connect-troubleshooting.md` is renamed to `amicited-link-troubleshooting.md`. Its
  heading anchors are listed in `packages/contracts/src/environmentHttp.ts`
  (`T3_CONNECT_TROUBLESHOOTING_SECTIONS`, the guide URL) and returned by
  `packages/client-runtime/src/connection/diagnosis.ts`; `apps/server/src/cloud/ConnectReachability.test.ts`,
  `scripts/check-changed.ts` and `.github/scripts/ci-changes.cjs` read the file by name.

## AmICited Link and hosted links

T3 Connect is renamed AmICited Link (`REMOTE_ACCESS_NAME` from `@amicited/identity`), and
it ships off. AmICited runs no hosted web app, relay or Clerk instance yet, so no build
carries a default for them: Link stays disabled until all of its values are configured.
Each open decision is marked `TODO(amicited-infra)` in code.

- Hosted web app origin: `packages/shared/src/connectAuth.ts` (`DEFAULT_HOSTED_APP_URL` is
  null), `apps/server/src/cloud/publicConfig.ts` (`AMICITED_HOSTED_APP_URL` only),
  `apps/web/src/hostedPairing.ts` (`VITE_HOSTED_APP_URL` only). Without one, copied thread
  links are in-app links, prompt links open the desktop app, outside MCP clients get in-app
  links (`apps/server/src/auth/McpOAuth.ts`), hosted pairing links are not offered, and the
  CLI signs in with a device code (`apps/server/src/cloud/CliTokenManager.ts`).
  `packages/shared/src/{threadLinks,promptLinks,providerAuthReturnUrl}.ts`,
  `packages/client-runtime/src/threadReference.ts` and the mobile `App.tsx` and
  `ThreadFeed.tsx` follow it.
- Hosted web router: `apps/web/vercel.ts` reads `AMICITED_HOSTED_WEB_ROUTER_HOST`,
  `AMICITED_HOSTED_WEB_LATEST_ORIGIN` and `AMICITED_HOSTED_WEB_NIGHTLY_ORIGIN`.
- Relay and Clerk: `.env.example` holds empty `AMICITED_*` placeholders, which
  `scripts/lib/public-config.ts` reads before the upstream `T3CODE_*` names.
- T3 Chat account linking is removed from the web client (`TunnelUsage.tsx`,
  `T3ConnectAccountPages.tsx`, `T3ConnectUserProfilePage.tsx`, `managedRelayState.ts`;
  `T3ChatUserProfilePage.tsx` and `useT3ChatLink.ts` are deleted) and off in the relay
  unless both `T3CHAT_LINK_SECRET` and `T3CHAT_URL` are set (`infra/relay/src/worker.ts`).
- Product copy: user-visible "T3 Connect" strings in `apps/server/src`, `apps/web/src`,
  `packages/client-runtime/src` and `packages/contracts/src` use `REMOTE_ACCESS_NAME`.
  Comments, identifiers, file names and test titles keep the upstream name.

## The `amicited` CLI, releases and self-update

The CLI is `amicited`, built and released from `QualityUnit/amicited-desktop`. It never
downloads, installs or follows instructions from T3 Code's repository, npm package or site.
Names come from `@amicited/identity` (`index.ts`) and `@amicited/identity/cli` (`cli.ts`).

- `packages/shared/src/cliRelease.ts`: release repository, archive names (`amicited-<version>-<platform>`), the `AMICITED_RELEASE_BASE_URL` override, and the `amicited` key of the npm manifest. A `t3-*` release can never satisfy a lookup.
- `apps/server/src/cloud/{npmRelease,pinnedRuntime,selfUpdate,servicePreflight}.ts`, `apps/server/src/serviceLauncher.ts`, `apps/server/src/cli/{update,invocation}.ts`: the npm package, executable, launcher and `AMICITED_INSTALL_BIN_DIR` names. Launchers named `t3` are never read, repointed or pruned.
- `apps/server/src/binCli.ts` and `apps/server/src/cli/**`: the root command name, and help and message copy.
- `apps/server/package.json`: the `amicited` bin and repository. The workspace name stays `t3`: the Effect language service derives the `t3/...` service keys from it, and renaming it would rewrite about 200 of them.
- `apps/server/vite.config.ts`, `apps/server/scripts/cli.ts`, `scripts/build-cli-archive.ts`, `scripts/build-npm-launcher.ts`, `scripts/npm-launcher/amicited.mjs` (was `t3.mjs`), `scripts/npm-launcher/bin.mjs`, `scripts/build-desktop-artifact.ts` (WSL runtime): the executable, archive and npm package names.
- `scripts/install.sh`, `scripts/install.ps1`: our repository, `AMICITED_*` variables, `~/.amicited` and the `amicited` link.
- `packages/ssh/src/tunnel.ts`: the remote bootstrap fetches and runs `amicited` archives.
- `apps/desktop/src/app/DesktopCliShim.ts`, `DesktopCliCommand.ts`: the launcher is `amicited` with its own marker, so the app never claims or removes T3 Code's `t3`.
- `apps/desktop/src/wsl/DesktopWslEnvironment.ts`, `apps/desktop/src/backend/DesktopBackendConfiguration.ts`: the WSL runtime executable name.
- `apps/desktop/src/app/DesktopStartupRecovery.ts`, `apps/web/src/components/desktopUpdate.logic.ts`, `apps/web/vite.config.ts`: release links fall back to our repository and download page; the restart prompt and Apple Silicon warning name the product.
- `apps/server/src/provider/ModelManifest.ts`: only the bundled manifest, unless `AMICITED_MODEL_MANIFEST_URL` names one to poll.
- `apps/server/src/provider/providerCompatibility.ts`: advisories match `UPSTREAM_T3_CODE_VERSION`, the T3 Code release this build is merged from. Update it with each weekly merge.
- `apps/server/src/triage/*`, `.github/triage/PLAYBOOK.md`: no remote playbook; source from our repository; reports go to support by email.
- `knip.jsonc`: the identity package keeps its shared manifest as written.
- `scripts/lib/cli-external-packages.ts`: `zod` stays staged for `@cursor/sdk` but is bundled, because the bundled MCP SDK imports it as ESM. `apps/server/vite.config.ts`: server bundles use `vega-canvas`'s browser build. Its Node build top-level-awaits an optional `canvas`, which turns Vega's importers into async module inits whose import cycle deadlocks the bundled server at startup. AmICited server code loads `undici` and `@napi-rs/keyring` through `createRequire`, as upstream does.
- `scripts/build-desktop-artifact.ts`: a signed macOS build without Clerk configuration signs without the associated-domains entitlement instead of failing.

## Agent and provider identity

Identity values come from `@amicited/identity` (`packages/amicited-identity`). Its
`src/index.ts` is shared byte-identical across the rebrand branches; this slice adds
`src/agent-identity.ts`. Each upstream file below imports a constant instead of a T3 literal.
Every package that imports it lists `@amicited/identity` in its `package.json`.

- `apps/server/src/provider/CodexProvider.ts`, `apps/server/src/provider/CodexChatGptAuth.ts`: Codex originator, clientInfo and ChatGPT `agent_name_hint` are `CLIENT_NAME`.
- `apps/server/src/provider/Drivers/ClaudeHome.ts`: `CLAUDE_CODE_ENTRYPOINT` is `USER_AGENT_PRODUCT`.
- `packages/provider-grok/src/server/acpSupport.ts`: no longer sets `GROK_OAUTH2_REFERRER` (T3's xAI partner value).
- `packages/source-control-github/src/server/GitHubRequestPolicy.ts`, `GitHubAppSignIn.ts`, `packages/source-control-gitcafe/src/server/GitCafeApi.ts`: User-Agent is `USER_AGENT_PRODUCT`.
- `packages/source-control-github/src/shared/definition.ts`, `src/server/GitHubAppSignIn.ts`, `src/server/GitHubSourceControlProvider.ts`: GitHub App sign-in reads `GITHUB_APP` and `AMICITED_GITHUB_APP_CLIENT_ID`; with no app configured it is hidden.
- `apps/server/src/mcp/McpHttpServer.ts`: MCP `serverInfo.name` is `PRODUCT_NAME`.
- MCP registration key `MCP_SERVER_KEY` (`amicited-local`, Codex direct twin `amicited-local-direct`): `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` (also its tool allowlist), `CodexAdapterV2.ts`, `packages/provider-acp/src/server/adapter.ts`, `mcpOverAcpBridge.ts`, `runtimeModel.ts`, `packages/provider-cursor/src/server/adapter.ts`, `packages/provider-opencode/src/server/adapter.ts`, `v2/adapter.ts`, `packages/provider-muse/src/server/adapter.ts`, `packages/provider-pi/src/server/mcpExtensionSource.ts`, `packages/provider-core/src/server/orchestrationInstructions.ts`.
- `packages/shared/src/t3McpToolPresentation.ts`, `packages/provider-acp/src/server/runtimeModel.ts`: tool-name parsing accepts `amicited-local` and still accepts the upstream `t3-code` names so recorded replays resolve.
- Agent-facing copy names the product through `PRODUCT_NAME` / `PRODUCT_SHORT_NAME`: `packages/provider-core/src/server/orchestrationInstructions.ts` (also the `<amicited_instructions>` tags), `runtimeInstructions.ts`, `textGenerationPrompts.ts`, `apps/server/src/provider/CodexDeveloperInstructions.ts` (`amicited_*` context keys), `apps/server/src/mcp/` tool titles, descriptions and errors, `apps/server/src/device/AgentDeviceShim.ts`, and the orchestration wake and status messages in `apps/server/src/orchestration-v2/`.
- Client names sent to agent runtimes use `USER_AGENT_PRODUCT` or `CLIENT_NAME`: `packages/effect-acp/src/client.ts`, `packages/provider-acp/src/server/adapter.ts`, `packages/provider-acp-registry/src/server/auth.ts`, `probe.ts`, `packages/provider-grok/src/server/status.ts`, `textGeneration.ts`, `packages/provider-kiro/src/server/status.ts`, `packages/provider-muse/src/server/sdk.ts`, `apps/server/src/mcp/AcpMcpStdioBridge.ts`, MCP Apps host context in `apps/web/src/components/chat/McpAppFrame.tsx`, `apps/mobile/src/features/threads/McpAppWebView.tsx` and `packages/client-runtime/src/mcpApps/host.ts`.
- Objects created in users' accounts use `PRODUCT_NAME`: `packages/provider-cursor/src/server/auth.ts`, `adapter.ts`, `packages/provider-opencode/src/server/textGeneration.ts`, `v2/textGeneration.ts`, `apps/server/src/peer/PeerLinks.ts` (and `PeerLinks.testkit.ts`), `apps/server/src/device/EasDeviceHost.ts`.
- Git identity and refs in users' repositories use `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` and the `amicited` namespace: `apps/server/src/vcs/GitVcsDriver.ts`, `GitVcsDriverCore.ts`, `apps/server/src/git/GitManager.ts`, `apps/server/src/orchestration-v2/CheckpointService.ts`, `apps/server/src/pullRequest/PullRequestReviewGuideService.ts`, `packages/shared/src/git.ts`, `packages/source-control-bitbucket/src/server/BitbucketApi.ts`, `packages/source-control-github/src/server/githubStackRebase.ts`.
- `packages/shared/src/usageLimits.ts`: the ChatGPT workspace admin request names `PRODUCT_NAME`.
- `knip.jsonc`: `packages/amicited-identity` ignores its unused `vite-plus` devDependency.
- `scripts/release-smoke.ts`: lists `packages/amicited-identity/package.json`.
- `evals/mcp-tool-use/run.ts`, `trim-capture.ts` and their tests: the eval harness names tools `mcp__amicited-local__*` like the real harnesses, and still recognizes the upstream names in the committed captures.

## Backported from upstream

These lines are identical to upstream `main`, applied early because CI needed them. The
weekly merge carries the same text, so drop each entry once it arrives.

- `apps/server/src/vcs/GitVcsDriverCore.ts`, `apps/server/src/storageCleanup.ts`: `isNonRepositoryGitStderr` also accepts Git 2.56's "gitfile does not point to a valid repository" wording.
- `pnpm-workspace.yaml` and the matching `pnpm-lock.yaml` overrides entry: `unenv` is pinned to the exact `2.0.0-rc.24` that `@cloudflare/unenv-preset` peers on.

## Rebrand: web copy and brand mark

The web UI names the product through `@amicited/identity` (`PRODUCT_NAME`,
`PRODUCT_SHORT_NAME`, `CLI_NAME`, `SUPPORT_EMAIL`, `DOWNLOAD_URL`) instead of hard-coding
T3 Code. Each change below is a string swap or one import, so an upstream merge conflicts
on the changed line only.

- `apps/web/package.json`: depends on `@amicited/identity`; drops `canvas-confetti`, which only the star prompt used.
- About 60 `apps/web/src` components, settings panels and logic files: "T3 Code" in copy becomes `PRODUCT_NAME` (`PRODUCT_SHORT_NAME` for "Sent by", the assistant author heading and the default theme label).
- `apps/web/src/components/sidebar/SidebarChrome.tsx` and `onboarding/WelcomeWizard.tsx`: pair the AmICited mark (`T3Wordmark.tsx`, redrawn by the brand art change) with the product name instead of "Code".
- `apps/web/src/components/chat/useComposerSend.ts`: no longer calls the GitHub star prompt. `GitHubStarPrompt.tsx` and its test are deleted.
- `apps/web/src/components/settings/SettingsPanels.tsx` and `settingsSearch.ts`: the mobile app row (T3's store QR codes) is removed until AmICited ships mobile apps. `MobileAppSettingsRow.tsx` is deleted.
- `apps/web/src/components/settings/MultipleAccountsNote.tsx`: drops the T3 FAQ link.
- `apps/web/src/lib/bootError.ts`: bug reports go by email to support, reinstall points to the AmICited site, and the triage command uses the AmICited CLI name.
- `apps/desktop/src/electron/ElectronShell.ts`: `parseSafeExternalUrl` also accepts `mailto:`, so the boot screen's support email link opens the mail client.
- `apps/web/src/connection/clientMetadata.ts`: client labels name AmICited.
- `apps/web/public/manifest.webmanifest`, `apps/web/index.html`: PWA name and the head comment.
- `scripts/amicited/electron-screenshots.mjs`: selects the sidebar brand by its new label.

## Reports

- `apps/web/package.json`: workspace dependency for report RPC types.
- `apps/web/src/marketing.tsx`: marketer Reports navigation and page heading.
- `apps/web/src/marketingDomains.tsx`: report connection controls reuse the existing API-key panel and account reuse command.
- `apps/web/src/components/CommandPalette.tsx`: marketer Open reports action.
- `apps/web/src/routes/_chat.reports.index.tsx` and `_chat.reports.$reportId.tsx`: route adapters for the AmICited reports screens.
- `apps/web/src/routeTree.gen.ts`: generated Reports route registration.
- `apps/web/src/rpc/amicitedReports.ts` and `marketingReports.tsx`: environment commands and native UI adapters for report management.
- `packages/client-runtime/src/rpc/client.ts`: registers the Reports change stream with the shared environment subscription bridge.

- `apps/server/package.json`, `packages/contracts/package.json`, and `pnpm-lock.yaml`: consume the isolated `@amicited/reports` package.
- `third-party-licenses.config.json`: generated ISC notice for `https@1.0.0`, an empty placeholder package `pptxgenjs` depends on that ships no license file.
- `packages/contracts/src/rpc.ts` and `clientRpcPermissions.ts`: add report RPC contracts and mutation permission guards.
- `apps/server/src/ws.ts`, `auth/RpcAuthorization.ts`, and `observability/RpcInstrumentation.ts`: thin report handlers, read/operate scopes and the AmICited metrics namespace.
- `apps/server/src/server.ts` and `mcp/McpHttpServer.ts`: provide report services, authenticated export routes and project-scoped agent tools.
- `apps/server/src/htmlRender/headlessChrome.ts`: expose CSS-page-size PDF printing through the existing isolated Chrome transport.
- `apps/server/src/ws.test.ts`, `auth/RpcAuthorization.test.ts`, `provider/AgentContextBudget.test.ts`, `provider/agentContextBudget.json`, and `packages/client-runtime/src/state/commandPermissions.test.ts`: extend existing service fixtures, scope checks and advertised-tool accounting.
- `evals/mcp-tool-use/run.ts` and `cases/reports.ndjson`: include report tool descriptions and schemas in the existing model-facing eval harness.
- `apps/web/src/marketingReports.logic.ts` and its focused test: API-key gating and reusable key-source selection for Reports.
- `apps/web/src/reportResources.ts` and its focused test: signed report resource loading, environment URL resolution, expired-token retry and export failures.

- `apps/server/src/preview/Manager.ts`, `preview/Manager.test.ts`, `preview/ServerBrowser.ts`, and `preview/ServerBrowser.test.ts`: reuse and reveal an existing report tab while navigating it to a fresh signed URL.
- `apps/server/src/htmlRender/publicProxy.ts`: share the existing public-address guard with report logo fetching.

- `apps/server/src/htmlRender/HtmlRender.ts`: report PDF printing shares browser permits and launch-failure diagnosis with html_render.
- `apps/web/src/reportEditing.ts` and its focused test: reveal the returned report preview tab on the destination thread before navigation, including new threads.
- `apps/web/src/reportChangeAtom.ts` and its focused test: retain only the selected report's change notifications so unrelated reports do not invalidate HTML resources.

## Rebrand: server, desktop and package copy

- User-visible copy in `apps/server/src/**`, `apps/desktop/src/**` and `packages/*/src/**` (error messages, notifications, provider status, connection diagnosis, recovery page, Codex sign-in callback pages): string literals read `PRODUCT_NAME` (and `CLI_NAME` for command hints) from `@amicited/identity` instead of hard-coding T3 Code. Each touched package lists `@amicited/identity` in its `package.json`. Desktop screen-capture messages say "screen capture" instead of "SnapShot".
- `packages/amicited-identity/src/projectFile.ts`, `packages/contracts/src/t3ProjectFile.ts`: the project file is `amicited.json`, schema `https://amicited.com/schema/amicited.json`; `t3.json` is still read when it is missing.
- `apps/server/src/project/T3ProjectFileLoader.ts`, `apps/server/src/vcs/GitVcsDriverCore.ts`: read `amicited.json`, then `t3.json`.
- `apps/server/src/workspace/WorkspaceFileSystem.ts`: an optional (`allowMissing`) read of `amicited.json` falls back to `t3.json`, so web and mobile clients load either file.
- `apps/web/src/components/ProjectScriptsControl.tsx`, `settings/ProjectActionsSettings.tsx`, `ProjectDefaultsSettings.tsx`, `SettingInheritance.tsx`, `settingsLayout.tsx`: project-file labels say `amicited.json`.
- `packages/shared/src/themePalettes.ts`: the `t3-chat` theme is labelled "Orchid" (id unchanged).
- `apps/web/src/components/settings/SnapShotSettings.tsx`, `SnapShotSetupDialog.tsx`, `settingsSearch.ts`: the settings page and nav say "Screen capture", matching the desktop messages and the GNOME extension name.
- `apps/server/src/policy/policyTemplates.ts` (allowed-clients help), `packages/client-runtime/src/relay/errorPresentation.ts`, `apps/server/src/preview/PreviewBrowserHost.ts` (AppArmor profile comment): the last "T3 Code" mentions left after the Link and CLI rebrands.
