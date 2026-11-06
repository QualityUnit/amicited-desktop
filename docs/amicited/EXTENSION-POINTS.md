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
- `apps/web/src/amicited-cloud.browser.test.tsx`: tests unmounted components with the real web UI kit.
- Server, contracts and web package manifests plus `pnpm-lock.yaml`: add workspace dependencies only.

RPC names: `amicited.cloud.status`, `amicited.cloud.connectOAuth`,
`amicited.cloud.connectApiKey` (`{apiKey}`), `amicited.cloud.disconnect`,
`amicited.cloud.summary`. Connection methods return the discriminated connection
state, including plain-language errors. Summary returns connection, domains and,
when available, analytics and headlines. OAuth opens the browser on the server's
machine; remote users must complete sign-in there or use a workspace key. A second
connection request sees `connecting`; disconnect cancels the pending callback.

Agents use existing provider-injected local MCP access (Claude Code, Codex and
other MCP-capable adapters): `amicited_cloud_read` accepts a read meta-tool name
and arguments; `amicited_cloud_run` forwards to `run_tool` behind the inherited
write/full-access checks. No cloud token is passed to providers. These proxies
are advertised while disconnected so an agent can explain the Settings connection;
they fail honestly until connected. The remote `read_tool` enforces read-only tool
execution; writes go through the separate destructive proxy.

### Pending mounts

No marketer routes or Wave 1 packages are changed here. `@amicited/ui-cloud`
exports these components; the mount adapter provides `ui={{Button, Input}}` from
the existing web UI kit and a system-browser `openExternal(url)` callback:

- Result renderer's `ResultFooterSlot`: `AmicitedUpsellCard` props are `result`
  (`{tool,status,output?}`), `gate`, `ui`, `openExternal`, `onConnect`, optional
  `connected`. Create one stable `createUpsellGate(localStorage, sessionStorage)`
  from `@amicited/cloud-client/upsell`. Successful eligible results claim one
  offer per session; Not now persists seven days, Dismiss persists indefinitely.
  Mount below the free result. `onConnect` navigates to the connection settings.
- Settings > General, AmICited connection slot: `AmicitedConnectPanel` props are
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
export contains Node networking and must stay on the server. No screenshot
harness or live provider eval was run in this unmounted wave, as directed by the
brief; component browser tests cover the UI and fake HTTP fixtures cover auth.
The existing MCP tool-use eval runner passed a one-case dry run; no paid model
was invoked.
