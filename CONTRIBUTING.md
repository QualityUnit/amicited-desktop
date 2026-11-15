# Contributing

AmICited Desktop is developed by the FlowHunt team in
[QualityUnit/amicited-desktop](https://github.com/QualityUnit/amicited-desktop). It is a fork of
[T3 Code](https://github.com/pingdotgg/t3code) (MIT), merged from upstream every week.

## Developer setup

See the [development runbook](docs/operations/development.md#first-checkout) for the initial checkout,
development commands, tests, and platform-specific desktop packaging prerequisites.

## Read this first

We are not actively seeking outside contributions and have limited review capacity. Opening a PR does
not create an obligation to review or merge it. We may close or defer it, ask for a smaller scope, or
reimplement the idea later.

Users report bugs and request features by email to [support@flowhunt.io](mailto:support@flowhunt.io).
Team members track work in this repository's issues. Search existing issues before starting work.

Before you change code, read [AGENTS.md](AGENTS.md) and the
[specification](docs/SPECIFICATION.md). AmICited code lives in `@amicited/*` packages. Upstream files
change only at the extension points listed in
[docs/amicited/EXTENSION-POINTS.md](docs/amicited/EXTENSION-POINTS.md), so the weekly upstream merge
stays workable.

<a id="prior-approval"></a>

## Agree on the problem and scope first

Features and intentional changes to product behavior need agreement from a maintainer on direction
and scope before you implement them. Link that agreement in your PR. A very small, focused fix for an
obvious bug can go straight to a PR; explain the defect and why the fix qualifies.

<a id="one-problem"></a>

## Solve one underlying problem per PR

A PR that solves several independent problems must be split, even when each fix is useful. Include the
contract, server, client, test, and documentation changes needed for that one problem. An adjacent
cleanup, refactor, or second fix needs its own PR.

Follow the [documentation rules](AGENTS.md#documentation). Update user guides in `docs/user` when how
to use a feature changes.

<a id="verification"></a>

## Provide evidence for the changed behavior

Explain how you established the problem, how you checked the change, and what you observed. Give the
reproduction steps, focused test commands or manual checks, and their results. State what you could
not check. "Tests pass" alone does not show that the change works.

UI changes need clear before/after screenshots. Attach evidence to the PR; do not commit PR-only
screenshots or recordings to the repository.

<a id="closure-and-reconsideration"></a>

## Closure and reconsideration

A PR that misses these requirements can be closed. A closure names the rule it missed and what would
fix it. Correct the problem and ask for reconsideration, or open focused replacement PRs linked to the
original.

## Security issues

Do not open public issues for vulnerabilities. See the [security policy](.github/SECURITY.md).
