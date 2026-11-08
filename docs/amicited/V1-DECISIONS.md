# v1 product decisions

Decisions made by the product owner on 2026-11-06 for the first version, with MCP free-tier entitlements corrected on 2026-11-07 against FlowHunt backend 4363bd78e3.
Where they contradict `docs/SPECIFICATION.md`, these win until the living
spec in Claude Docs is updated.

| Topic            | Decision                                                                                                                                                                                                                                                                                                                                                                                   | Spec says                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| First run        | Chat-first T3 layout: no dashboard, website form wall or account screen. The app and its local tools work fully without an account. AmICited is offered only after the user's first win (for example a finished audit or AI visibility check).                                                                                                                                             | §8.1: first-run screen with Google / Microsoft / email sign-in. |
| AmICited plans   | Connecting MCP is free for every account, including Starter and no-plan accounts: 12 free_* tools plus discovery. One-off checks spend workspace credits; welcome credits cover new accounts, and no paid plan is needed. Trial, Pro, Premium and Enterprise unlock paid tools. Optional 7-day trial; Starter EUR 50, Pro EUR 120/month (600 calls/h), Premium EUR 500, Enterprise custom. | §8.1 "Plans": a free AmICited account.                          |
| What is free     | The desktop app and all built-in local tools, running on the AI subscription the user already has. Never gated behind an account.                                                                                                                                                                                                                                                          | Same intent.                                                    |
| MCP endpoint     | `https://api.flowhunt.io/mcp/amicited`, streamable HTTP, OAuth 2.1 (`amicited:read`, `amicited:write`, `amicited:spending`) or `Authorization: Bearer <workspace-api-key>`. Exposes about 580 tools in 13 toolsets, including 12 free_* tools and `list_toolsets`, `search_tools`, `describe_tool`. Docs: https://www.amicited.com/docs/mcp/connect/                                       | §8: `mcp.amicited.com` with `brand.*`, `prompts.*` tool groups. |
| Sign-up link     | One OAuth flow for connect and sign-up, with `app=amicited`; connected workspaces start a trial at `https://app.flowhunt.io/amicited/subscription`.                                                                                                                                                                                                                                        | §8.1: `amicited.com/oauth/authorize`.                           |
| v1 tools         | AI visibility check, site audit basics, content tools, SERP & keywords.                                                                                                                                                                                                                                                                                                                    | §9 lists the full library.                                      |
| Extension points | Registry in `docs/amicited/EXTENSION-POINTS.md`, not `patches/` (upstream uses `patches/` for pnpm dependency patches, which cannot patch workspace sources).                                                                                                                                                                                                                              | §2: patches in `patches/`.                                      |
| Release bar      | Council of Claude Opus and GPT Sol, judging the scripted marketer journey from screenshots plus code. Both must score at least 8/10.                                                                                                                                                                                                                                                       | Not in spec.                                                    |

Upstream changes use small, self-contained extension points listed in
`docs/amicited/EXTENSION-POINTS.md`. No patch files are required (overrides §2).

Free discovery does not report plan entitlement. Show access as unconfirmed until a paid-tool success or subscription refusal establishes full or free access. Never spend a paid call to probe status.

Domains are T3 projects in marketer mode. Domain metadata and connections are
AmICited-owned and keyed by project ID; developer directory projects retain
the upstream flow. This owner decision supersedes the global browser website
preference described in earlier waves and the specification snapshot.

Domains record a CMS and optional connected site folder. Existing domains default
to Not sure and retain their managed folders. Agents use T3's normal Full access default, including connected site folders. Users can choose Ask before acting per thread. Agents can edit files in this folder. Nothing is published or pushed for you. Review changes in the chat. Replacing site files creates another domain so existing chats keep their working directory.

Full access runs AmICited reads and writes without app approval cards. Destructive actions still require one confirmation per call; chat grants never cover them. Ask before acting retains app approvals and chat grants. Agents mention workspace credit use in their replies.

A copied repository abandoned in the New domain dialog is retained with an explicit reuse offer in that dialog; changing source or hostname clears its pending identity.
