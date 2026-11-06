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
