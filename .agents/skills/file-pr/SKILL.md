---
name: file-pr
description: File a concise pull request. Use when the user asks to file, open, or create a PR.
---

# File PR

Before filing, check whether a PR for this branch already exists. Review the
diff locally against the base branch (usually `origin/main`) to make sure its
contents match the goal. Never push to `main` directly; branch first.

PR titles usually become commit messages, so follow the repository's title
conventions. Look at recently merged PRs and Git history for examples. Prefer a
concise, human-readable title that explains why the change matters:

BAD

> ❌ perf(server): negotiate permessage-deflate on the websocket

GOOD

> ✅ perf(server): cut websocket frame size by 70%+ with gzipping

Open the description with a simple explanation of the problem based on the
user's original prompt, then briefly explain the solution. Do not lead with an
implementation inventory:

BAD

> ❌ Removed implicit workspace carry-over from every "new thread" entry point (cmd+n / cmd+shift+o, sidebar v1/v2 buttons, command palette). New threads inherit only the project from context; branch, worktree, and env mode always come from the configured defaults. Deleted buildContextualThreadOptions, startNewThreadInProjectFromContext, and the v1 sidebar's seed-context machinery.

GOOD

> ✅ My "new worktree" default was ignored when starting new threads on existing worktrees. Super unintuitive. Now your preferences always apply.

When the change touches upstream T3 Code files, say so in the description and
name the extension point or patch in `patches/`. Reviewers need to know what
will conflict on the next upstream merge.

When the change implements or contradicts `docs/SPECIFICATION.md`, link the
section. The living spec is in Claude Docs, so say whether that also needs an
update.

End the description with the public model name and harness that made the
changes, for example `Created with <model> in Claude Code.` or
`Created with <model> in Codex.` Include the reviewer models that wrote part of
the change. Use the model name the harness reports. If model identity is
unavailable, name the harness without guessing a model. If the harness or the
user's instructions already define an attribution footer, use that one and do
not add a second.

Before submission, check the title, description, quotes, and attachments for
secrets and private details. This repo is public: no customer names, API keys,
internal URLs, or AmICited cloud credentials.

Open a real PR rather than a draft so review bots run. If `gh pr create` fails
because the GraphQL rate limit is used up, open it through REST with
`gh api repos/<owner>/<repo>/pulls -f title=... -f head=... -f base=... -F body=@<file>`. If the user also asked
to babysit it, continue with the `babysit-pr` skill.

Do not post a follow-up PR comment unless it serves the user's request. When a
comment is needed, use the `leaving-pr-comments` skill.
