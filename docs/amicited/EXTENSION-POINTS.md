# AmICited extension points

Upstream files change only at small, self-contained extension points listed here.
No patch files are required; this supersedes section 2 of the specification.

- `apps/web/src/components/chat/ChatHeader.browser.test.tsx`: explicitly selects and restores developer mode for both rename cases.
- `apps/web/src/components/ChatView.browser.test.tsx`: explicitly selects and restores developer mode for the reserved-draft case.

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
- `apps/web/src/components/ChatView.tsx`: reads the shared workspace mode to hide branch controls, terminal drawer, and developer panel launchers and mounts marketer composer context in the existing ContextStrip outside Host.
- `apps/web/src/routes/_chat.settings.general.tsx`: provides the reverse switch from developer to marketer mode.
- `apps/web/src/routeTree.gen.ts`: generated route registration for the marketing mounts.
- `knip.jsonc`: declares the scripted screenshot entry points.
- `scripts/lib/third-party-licenses.ts`: treats the fork’s @amicited packages as first-party while retaining their dependency notices.
- `scripts/lib/third-party-licenses.test.ts`: covers first-party exclusion in the existing notice-generation fixture.
- `pnpm-lock.yaml`: workspace importer entries for the new packages and their consumers only.
- `.gitignore`: excludes local journey captures.

New web adapter files (`src/marketing.tsx` and `routes/_chat.{home,tasks,marketing-settings,tools.*}.tsx`)
only bridge upstream environment RPC, routing and task creation to `@amicited/ui-marketing`.
Home Ask and New task seed the selected assistant and send through the upstream
composer once it mounts. Fix this with AI opens the same composer for review.

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
- `apps/web/src/components/chat/ChatComposer.tsx`: provides the marketer composer prompt and portals website, connection and starter controls to that context strip; disconnected assistants disable sending.
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
- `apps/server/src/mcp/toolkits/marketing/{tools,handlers}.ts`: thin marketing discovery and execution adapters; execution requires environment write access because it can consume the user's AI subscription.
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
and a quiet connection link after a persisted first win otherwise. Tools retain
all free cards and append optional cloud explainers.

## Launch branding

- `apps/web/index.html`: AmICited boot title and splash label, with upstream attribution retained.
- `apps/desktop/package.json`: packaged product name is AmICited Desktop.
- `apps/desktop/src/app/DesktopEnvironment.ts`: AmICited window name with existing stage suffixes.

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
- `apps/web/src/components/chat/ComposerFooterControls.tsx` and `apps/web/src/components/ComposerContextPermissions.tsx`: hide advanced permission chips in marketer mode; server permission enforcement is unchanged.
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
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: plain assistant name, including the Replay development provider.
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

- `apps/web/src/components/chat/ComposerModelEffort.tsx`: marketer footer omits workflow and access controls.
- `apps/web/src/components/chat/ProviderModelPicker.tsx`: hides Replay in production marketer mode.
- `apps/web/src/components/chat/TimelineWorkEntryRow.tsx`: sends cloud tool results through the marketer renderer.
- `evals/mcp-tool-use/run.ts`: includes real cloud proxy declarations in the evaluator.

- `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`: names completed marketing work from its actual results.
- `apps/server/src/provider/AgentContextBudget.test.ts` and `agentContextBudget.json`: measure the real discovery/call proxy declarations.
- `apps/web/src/amicited-cloud.browser.test.tsx`: exercises shared connect and cancellation without stale completion.
- `scripts/amicited/journey-screenshots.ts`: isolated MCP fixture captures alongside the existing journey.

## Cloud approvals and readable results

- `apps/server/src/ws.ts`, `packages/contracts/src/clientRpcPermissions.ts` and `apps/server/src/observability/RpcInstrumentation.ts`: settings-authorized cloud approval answers and access invalidation; agents cannot answer these through the cloud proxy.
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
- `apps/web/src/components/DevReplayHost.tsx`: marketer captures prefer the current registered domain over the implicit scratch project.
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
- `apps/web/src/hooks/useHandleNewThread.ts` and `components/chat/useComposerSend.ts`: connected marketer sites select upstream approval-required runtime mode at creation and send; developer settings remain upstream.
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

- `apps/server/src/orchestration-v2/RuntimePolicy.ts`: enforces domain supervision at provider execution, including queued turns and recovery; metadata failures use independent site membership and managed-folder boundaries to preserve unrelated project modes.
- `packages/client-runtime/src/state/threadRequests.ts`: carries the related file-change paths into pending approvals.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.tsx`: prioritizes the hostname when a custom domain status is supplied.
- `apps/web/src/components/ChatView.tsx`: renders upstream diff panels in marketer mode with an explicit Close control.
- `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx`: presents relative file names and compact outline approval actions, with raw details under More.
- `apps/web/src/components/chat/TimelineAssistantRows.tsx`: uses an aligned, underlined Review action.

- `apps/web/src/components/chat/ChatRightPanel.tsx`: accepts optional inline layout controls for the marketer diff close action.

- `apps/web/src/components/DiffWorkerPoolProvider.tsx`: initializes both diff themes so a theme switch cannot render before its theme reaches the workers.

- `apps/web/src/components/RightPanelTabs.tsx` and `components/chat/ChatRightPanel.tsx`: optional add-menu visibility for the marketer review panel.
- `apps/server/src/orchestration-v2/RuntimePolicy.test.ts`: verifies site supervision and metadata failure at the runtime boundary.

- `apps/web/src/filePathDisplay.ts`: optional workspace-label omission for marketer file rows and approvals, matching the review diff.
- `apps/web/src/components/sidebar/SidebarProjectFolderHeader.browser.test.tsx`: verifies short hostnames fit at rest and visible status icons and actions do not overlap on hover or focus, for short and long hostnames.

- `apps/web/src/components/chat/MessagesTimeline.logic.ts`: optional folder-label omission for marketer work rows while retaining upstream label selection.
