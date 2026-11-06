# AmICited extension points

Wave 0 keeps upstream packages intact. This registry supersedes the specification’s
proposal to store extension patches in `patches/`, which already holds pnpm patches.

- `packages/client-runtime/src/state/commandPermissions.test.ts`: extends existing grant coverage to marketing runs.
- `packages/contracts/package.json`: dependency on the standalone marketing RPC definitions.
- `packages/contracts/src/clientRpcPermissions.ts`: guards marketing runs with the existing operate scope on clients.
- `packages/contracts/src/rpc.ts`: adds marketing methods to the authenticated WebSocket group, allowing existing clients to use their normal environment connection.
- `apps/server/package.json`: dependencies on local marketing tools and their contracts.
- `apps/server/src/observability/RpcInstrumentation.ts`: declares marketing RPC telemetry namespaces.
- `apps/server/src/ws.ts`: thin list/run handlers call the MarketingTools Effect service.
- `apps/server/src/auth/RpcAuthorization.ts`: requires orchestration read for listing and orchestration operate for running tools.
- `apps/web/package.json`: dependencies on marketing UI and tool types.
- `apps/web/src/branding.ts`: sources the marketer-facing product name from one package constant.
- `apps/web/src/routes/__root.tsx`: selects the marketer shell, bypasses developer onboarding, and redirects local marketer launches to Home.
- `apps/web/src/components/ChatView.tsx`: reads the shared workspace mode to hide branch controls, terminal drawer, and developer panel launchers.
- `apps/web/src/routes/_chat.settings.general.tsx`: provides the reverse switch from developer to marketer mode.
- `apps/web/src/routeTree.gen.ts`: generated route registration for the marketing mounts.
- `knip.jsonc`: declares the scripted screenshot entry points.
- `scripts/lib/third-party-licenses.ts`: treats the fork’s @amicited packages as first-party while retaining their dependency notices.
- `scripts/lib/third-party-licenses.test.ts`: covers first-party exclusion in the existing notice-generation fixture.
- `pnpm-lock.yaml`: workspace importer entries for the new packages and their consumers only.
- `.gitignore`: excludes local journey captures.

New web adapter files (`src/marketing.tsx` and `routes/_chat.{home,tasks,marketing-settings,tools.*}.tsx`)
only bridge upstream environment RPC, routing and task creation to `@amicited/ui-marketing`.
The Home Ask box creates an upstream scratch task and preserves its prompt in the
composer; the user selects their own provider and sends it there.

## Tools and transports

`@amicited/tools-core` owns definitions, JSON Schemas, registry search and the
bounded runner. Tool modules live in `@amicited/tools`; `MarketingTools` in its
`service` export is the shared server capability. `amicited.tools.list` and
`amicited.tools.run` are authenticated WebSocket RPC methods. Local tools need
no cloud account. Results are returned to the caller; durable history is deferred.

MCP registration is deferred to Wave 1: extend `apps/server/src/mcp/McpHttpServer.ts`
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
Bearer key). There is no permanent cloud free plan: the 7-day trial leads to
Pro at EUR 120 including MCP. Signup:
https://app.flowhunt.io/sign-in?app=amicited&plan=pro&interval=month .

Wave 1A adds these fenced marketing integration seams:

- `apps/server/src/mcp/McpHttpServer.ts`: registers the authenticated marketing discovery/run toolkit with the same service as UI RPC.
- `apps/server/src/mcp/toolkits/marketing/{tools,handlers}.ts`: thin marketing discovery and execution adapters; execution requires environment write access because it can consume the user's AI subscription.
- `apps/server/src/marketing/MarketingToolsLive.ts`: bridges the portable library to the selected provider instance's existing one-shot runner, resolving connection state on each invocation.
- `apps/server/src/ws.ts`: supplies the provider-aware marketing service to existing marketing RPC handlers.
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
No screen styling changes. Wave 1B can replace this generic rendering.

Provider-backed tools use the configured text-generation model, with its exact
provider/model identity; they do not silently select another assistant. The shared
runner supports Claude, Codex, OpenCode and Antigravity; drivers without this
capability return `needs_provider`. SERP uses plain fetch to avoid taking over a
user's browser tab; blocked or changed Google layouts are explicit results. Site
checks are basic heuristics, not full standards validators. Sitemap indexes count
child sitemap entries rather than claiming a count of all pages. Visibility has no
live search and ranks only the supplied brand/competitors by first occurrence.
