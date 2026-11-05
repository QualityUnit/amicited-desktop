# AGENTS.md

Instructions for coding agents (Claude Code and Codex) working in this repo.
Claude Code loads this file through `CLAUDE.md`.

## Project

AmICited Desktop is a local-first AI agent workstation for marketers, built as
a fork of [T3 Code](https://github.com/pingdotgg/t3code). It is in the
specification phase: `docs/SPECIFICATION.md` is the source of truth, and it is a
snapshot of a living doc in Claude Docs. When a change contradicts the spec,
say so in the PR instead of silently diverging.

## Fork policy

Upstream T3 Code `main` is merged weekly. Never delete or rewrite upstream
packages. AmICited code lives only in new `@amicited/*` packages under
`packages/` and `apps/`. Upstream files change only at documented extension
points, each kept as a patch in `patches/`. See section 2 of the spec.

## Workflow skills

Maintainers use Claude Code and Codex only. The workflow skills in
`.agents/skills/` (shared with Claude Code through `.claude/skills`) cover
filing, reviewing, babysitting, and merging PRs. See
`.agents/skills/README.md`.

- Cross-model review: from Claude Code the reviewer is GPT Sol through
  `codex exec`; from Codex it is Claude Opus through `claude -p`.
- Council members: Claude Opus and GPT Sol, at high reasoning effort, latest
  flagship versions. Pin a version here if the team needs one.
- Default branch is `main`. Never push to it directly.
