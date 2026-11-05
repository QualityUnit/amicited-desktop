---
name: council
description: Get independent review from Claude Opus and GPT Sol and loop until both agree. Trigger this if the user says 'council'.
---

# Council

Before an audit, address outstanding PR comments, fix known issues, and run
relevant checks. Give council the updated implementation; do not defer known
fixes until reviews return. If the user wants to discard the implementation
and explore new ideas, skip fixes to code being replaced.

## Members

Maintainers here have Claude Code and Codex only, so the council has two
members, one per provider, each at high reasoning effort:

- **Claude Opus**, run with `claude -p`.
- **GPT Sol**, run with `codex exec`.

If the user's instructions or `AGENTS.md` name other members or versions, use
those. Run both members as fresh CLI processes, even the one from your own
provider, so neither is anchored to your context. Use the exact commands and
waiting rules in [sol-loop](../sol-loop/SKILL.md#2-run-the-reviewer). Start both
in the same turn so they run in parallel.

If a member's CLI is missing, not logged in, or fails, report it instead of
substituting a model or reviewing the change yourself.

## Rounds

Give each member the request and relevant context in a brief file. For review
or feedback, keep their work read-only (the sol-loop commands already are).
Collect their responses and summarize the useful findings, disagreements, and
recommended next steps.

For a code review, ask each member for a score out of 10.
Count each full review pass as one round.
A fresh review after fixes starts a new round.

If the work ends in a pull request, put the results in the PR description.
Put this section before the model and harness line at the end:

```markdown
## Council review

Rounds: 2

| Member | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Opus | 7/10 | 9/10 |
| GPT Sol | 8/10 | 10/10 |
```

If a member gives no score, write `no score`. Do not invent one.
If the PR is open, edit the description. Do not post a comment for this.
If there is no PR, put the same results in the final reply only.

If you agree with their recommendations, make the changes and request a fresh
review after. Continue this process until both members are satisfied with the
outcome.

Do not let repeated reviews result in scope creep. It is your job to fight to
keep scope limited.
