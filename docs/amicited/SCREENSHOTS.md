# Marketer journey captures

Use Node 26.12.1 with workspace dependencies installed:

```sh
node scripts/amicited/journey-screenshots.ts .amicited-shots/wave0
```

The script launches the actual server and Vite dev stack without file watchers with an explicit temporary home,
disables live-data seeding, requests unused ports from the OS, pairs headless Chromium,
and captures each step in light and dark at 1440×900 and 1280×800:

1. `01-first-launch`: website-first, account-free setup.
2. `02-website-and-ai`: saved website and actual AI subscription readiness.
3. `03-first-win`: completed website health audit using `seo.site.audit`, including partial check coverage.
4. `04-home`: brand, Ask box, quick actions and recent result.
5. `05-tools-grid`: local marketing tool packs. `05-site-audit` captures the audit tool result and `05b-ai-visibility` captures the explicit connect-assistant state.
6. `06-tool-form`: SSL check with example.com entered; `06-tool-result` captures its completed result.
7. `07-new-task`: empty composer, without a missing-prompt error.
8. `08-settings-general`: website, connection slot and Developer features toggle.
9. `09-developer-mode`: upstream settings and developer navigation remain reachable.

Files carry theme and viewport suffixes, for example `04-home-dark-1280.png`.

Chromium must be installed in Playwright’s normal cache. The harness depends on
the existing scripts workspace’s playwright-core; it adds no browser dependency.

All output is ignored by git. The private `dev-stack.log` may contain a one-time
pairing URL; do not upload it. The harness closes its browser, signals only the
server and web processes it spawned, and deletes its temporary
home on exit. It never reads or writes `~/.t3`. Add future journey steps before
the finally block, using accessible locators and explicit readiness conditions.
