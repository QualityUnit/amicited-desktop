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

Wave 20 (round 16 fixes, r18 evidence), 2026-11-06, Node 26.12.1:

```sh
vp test run packages/amicited-ui/src/chat.test.ts apps/web/src/marketingContext.test.ts apps/server/src/marketing/MarketingToolsLive.test.ts apps/web/src/components/chat/ChatHeader.browser.test.tsx apps/web/src/components/chat/ThreadErrorBanner.test.tsx apps/web/src/amicited-cloud.browser.test.tsx
pnpm --filter @amicited/ui-marketing --filter @amicited/tools-core --filter @amicited/tools --filter t3 run typecheck
pnpm --dir apps/web exec effect-tsgo tsrs --noEmit
AMICITED_REAL_PROVIDER=1 AMICITED_KEEP_HOME=1 node scripts/amicited/journey-screenshots.ts .amicited-shots/r18
AMICITED_CAPTURE_HOME="$(cat .amicited-shots/r18/isolated-home.txt)" node scripts/amicited/electron-screenshots.mjs .amicited-shots/r18
vp run check:changed
```

The authenticated Claude Haiku turn calls the real local `seo.site.audit`
through `marketing_tools_run`, returns a 41/100 audit of example.com, and renders
the result card in browser and Electron. The isolated T3 home uses the normal
user HOME; no live T3 state is opened for writing. The transcript, rendered
conversation and complete tool result JSON are retained in r18. Two inexpensive
real turns were used while extending the proof; later capture passes reuse
the stopped isolated state and spend no model allowance.

The journey includes settled light/dark captures at 1344×1016 and the 1440
journey, at 2×, plus fresh dark launch, approval and recovery-card fixtures.
Recovery evidence mounts the real component as a controlled fixture; the real
Haiku turn authenticated successfully. The native captures reuse that persisted
real result with an isolated Chromium profile. No production AmICited cloud
connection was invoked.
