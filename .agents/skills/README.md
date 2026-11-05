# Agent skills

Workflow skills for maintainers, shared by Claude Code and Codex. Codex reads
them from `.agents/skills/`. Claude Code reads them through the
`.claude/skills` symlink, so there is one copy to edit.

| Skill | Say | What it does |
|---|---|---|
| `full-send` | "full send" | Takes a change to a merged PR with nobody watching: proves it, reviews it, files it, babysits it, merges it. |
| `full-stop` | "full stop" | Same as `full-send`, but stops when the PR is ready for you to merge. |
| `council` | "council" | Gets independent review from Claude Opus and GPT Sol, and loops until both agree. |
| `sol-loop` | "sol loop" / "opus loop" | Reviews a change with the other provider's model in a loop until both agents agree. |
| `file-pr` | "file a PR" | Files a short PR that leads with the problem, not an inventory of changes. |
| `takeover` | "take over" | Finishes someone else's PR, branch, or agent session, and keeps their credit. |
| `babysit-pr` | "babysit" | Watches a PR through CI and review bots, and fixes the real findings. |
| `modernize` | "modernize" | Rebases an old PR and decides if it should still exist. |
| `leaving-pr-comments` | (automatic) | Formats comments that an agent posts on your behalf. |

Some skills call others: `full-send` uses `sol-loop`, `file-pr`, and
`babysit-pr`; `full-stop` uses `full-send`; `takeover` uses `modernize`,
`file-pr`, `babysit-pr`, and `leaving-pr-comments`; `council` reuses the
reviewer commands in `sol-loop`.

## Requirements

- An authenticated [GitHub CLI](https://cli.github.com) (`gh`).
- `python3` for `babysit-pr`'s `pr-wait` script.
- Both `claude` (Claude Code) and `codex` (Codex CLI) installed and logged in.
  Cross-model review runs the other provider's CLI from inside your session:
  `codex exec` from Claude Code, `claude -p` from Codex.

## How these differ from tstack

Adapted from [tstack](https://github.com/t3dotgg/tstack) at `1085050`
(MIT, copyright 2026 Theo Browne). Changes:

- No T3 Code tools. `watch_pull_request`, `delegate_task`, and
  `orchestrator_capabilities` are gone. PRs are watched with `pr-wait`, and
  reviewers run as CLI processes.
- `council` has two members (Claude Opus, GPT Sol), not three, because
  maintainers have no third provider.
- `sol-loop` picks the reviewer from the other provider, so Codex users get
  Claude Opus review and Claude Code users get GPT Sol review.
- Repo context: the T3 Code fork policy and `patches/` in `modernize`,
  `file-pr`, and `full-send`; the spec in `docs/SPECIFICATION.md`; how to wait
  on a PR with no CI checks; docs-only proof.

Put personal settings, like a pinned model version, in `AGENTS.md` (or your
own `~/.claude/CLAUDE.md` / `~/.codex/AGENTS.md`) instead of editing the skills.

## tstack license

```
MIT License

Copyright (c) 2026 Theo Browne

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
