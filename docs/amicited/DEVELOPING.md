# Local development

Run from the repository root. Install the versions pinned in `package.json`
without sudo (nvm must already be installed):

```sh
source ~/.nvm/nvm.sh
nvm install 26.12.1
nvm use 26.12.1
npm install -g pnpm@12.14.0
curl -fsSL https://vite.plus | bash
. ~/.config/vite-plus/env
nvm use 26.12.1 # Reassert Node after loading Vite+ or starting a fresh shell.
vp i --frozen-lockfile -- --yes
```

The global CLI follows [Vite+'s installation guide](https://www.viteplus.dev/guide);
CI uses `voidzero-dev/setup-vp@v1`. `vp` delegates to the repository's pinned
Vite+ version. Do not regenerate `pnpm-lock.yaml` for a baseline install.
If `.t3/setup-running` contains a live PID, let setup finish before installing.
The direct install above does not need `T3CODE_PROJECT_ROOT`.

```sh
vp run typecheck
for package in packages/contracts packages/shared packages/client-runtime apps/server apps/web; do
  (cd "$package" && pnpm test)
done
```

Web tests require Chromium: `pnpm --dir apps/web exec playwright install chromium`.
Baseline checks can expose upstream/environment failures; preserve their output.
Use `vp run check:changed` for normal changes before pushing.

Start a fresh, isolated web/server stack:

```sh
export AMICITED_DEV_HOME="$(mktemp -d /tmp/amicited-dev.XXXXXX)"
T3CODE_DEV_SEED=0 vp run dev --home-dir "$AMICITED_DEV_HOME" --no-browser --no-auto-bootstrap-project-from-cwd
```

`--home-dir` sets the child's `T3CODE_HOME`; it is necessary because the
worktree's `.t3` normally takes precedence over an ambient `T3CODE_HOME`.
State goes below `$AMICITED_DEV_HOME/userdata`. Read the actual web URL and
startup pairing URL from the log, then open the pairing URL once. Never use
`~/.t3/userdata`, set `VITE_HTTP_URL`/`VITE_WS_URL`, or publish pairing tokens.
Stop this stack with Ctrl+C in its original terminal.

To capture the first screen using the repo's Playwright, set `BASELINE_URL`
locally to the startup pairing URL (keep it out of shared logs), then run:

```sh
mkdir -p .amicited-shots/baseline
node --input-type=module <<'JS'
import { chromium } from './apps/web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.BASELINE_URL, { timeout: 120000 });
  await page.getByRole('main').waitFor({ timeout: 120000 });
  await page.screenshot({ path: '.amicited-shots/baseline/first-screen.png', fullPage: true });
} finally {
  await browser.close();
}
JS
```

Captures are ignored by Git. A fresh home intentionally has no projects or threads.

## Known baseline

On an idle host, apps/web passes 5493/5493 tests. Heavy host load can cause
spurious web browser failures. On this machine apps/server has nine failures
that also fail on pure upstream `eb988f2ac`:

- `src/cli/invocation.test.ts` (2)
- `src/environment/ServerEnvironment.test.ts` (1)
- `src/process/externalLauncher.test.ts` (1)
- `src/project/AgentSessionScanner.test.ts` (1)
- `src/usage/UsageService.test.ts` (2)
- `src/vcs/GitVcsDriverCore.test.ts` (1)
- `src/provider/Drivers/ClaudeSkills.test.ts` (1)

The Wave 3 Knip check loads Metro successfully under Node 26.12.1 with the pinned
workspace install (`vp i --offline`). Both passes of `vp run knip:check` pass;
no Metro configuration or hook bypass is required. Run hooks with that Node version
and the repository dependencies rather than a different global Knip installation.

## Last verified

Wave 16 (round 14 evidence), 2026-11-06, Node 26.12.1:

```sh
vp test run packages/amicited-ui/src/experience.test.ts packages/amicited-ui/src/fields.test.ts packages/amicited-cloud/src/upsell.test.ts packages/amicited-ui-cloud/src/index.test.tsx apps/web/src/amicited-cloud.browser.test.tsx packages/amicited-tools/src/library.test.ts apps/web/src/components/chat/ChatHeader.browser.test.tsx apps/web/src/components/ChatView.browser.test.tsx
pnpm --filter @amicited/ui-marketing --filter @amicited/ui-cloud --filter @amicited/tools --filter @amicited/cloud-client --filter t3 run typecheck
pnpm --dir apps/web exec effect-tsgo tsrs --noEmit
pnpm --dir scripts exec effect-tsgo tsrs --noEmit
AMICITED_JOURNEY_QUICK=1 node scripts/amicited/journey-screenshots.ts .amicited-shots/r14
node scripts/amicited/electron-screenshots.mjs .amicited-shots/r14
vp run check:changed
```

Focused tests: 49 passed in eight files (including the three upstream cases). Marketing UI, cloud UI, server, web and
scripts typechecks pass; existing Effect schema-brand suggestions are informational.
The journey requires the independent cloud specimens described in SCREENSHOTS.md.
It captures the complete 2× parity set and 1440 journey with controlled fixtures and no debug prefixes.
No paid provider or production MCP connection is invoked.

Search navigation and the concrete visibility/audit offers are included in the
journey. Native visibility answers include excerpt, citations and all required
schema fields; the harness fails if renderer decoding rejects them.

The actual built Electron main mounts the marketer UI under an isolated OS home,
T3 home and port offset. Inter, Geist, Geist Mono and Fraunces all load at 2×.
Home, the real audit and visibility fixtures are captured in both themes.
The previous native evidence failure was in target selection/CDP setup, rather
than font loading: localhost reaches CDP, DevTools must be excluded, and first-run
shell markers are nested. The normal desktop dev launcher is never used, and the
owner's desktop process is untouched.

The earlier claim that the three browser failures were upstream baseline failures
was incorrect. This branch changed fresh storage to marketer mode. The two
ChatHeader untouched-rename cases (blur and Enter) expected “New thread”; the
ChatView reserved-draft case expected the developer sidebar. Their fixtures now
explicitly select developer mode and restore the previous storage value after
unmount. Their original assertions are unchanged.

The unscoped command selects the closest remote-main merge base, currently
`upstream/main` (`d694c44d0784`), and passes all fast checks: 784 tests plus 27
React Compiler checks, both Knip passes and 45 affected-package typechecks.
An explicit `vp run check:changed origin/main` was also attempted after fetching.
That fork ref (`1efb72d1b7cd`) predates the upstream import, selects 31,735 files,
and fails before running checks with `spawn E2BIG`. It is not a passing result;
no origin ref was rewritten to conceal the tooling limit.
