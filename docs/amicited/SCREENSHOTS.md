# Marketer journey captures

Use Node 26.12.1 with workspace dependencies installed:

```sh
node scripts/amicited/journey-screenshots.ts .amicited-shots/wave0
```

The script launches the actual server and Vite dev stack without file watchers with an explicit temporary home,
disables live-data seeding, requests unused ports from the OS, pairs headless Chromium, and captures 1440×900 PNGs:

1. `01-first-launch.png`: account-free first launch.
2. `02-home.png`: Home and Ask box.
3. `03-tools-grid.png`: local tool packs.
4. `04-tool-form.png`: SSL check with example.com entered.
5. `05-tool-result.png`: completed SSL check (or its structured connection error offline).
6. `05-site-audit.png`: composite website audit, including partial check coverage.
7. `05b-ai-visibility.png`: AI visibility result (or the explicit connect-assistant state).
8. `06-tasks.png`: upstream tasks entry point.
9. `07-settings.png`: mode switch.

Chromium must be installed in Playwright’s normal cache. The harness depends on
the existing scripts workspace’s playwright-core; it adds no browser dependency.

All output is ignored by git. The private `dev-stack.log` may contain a one-time
pairing URL; do not upload it. The harness closes its browser, signals only the
server and web processes it spawned, and deletes its temporary
home on exit. It never reads or writes `~/.t3`. Add future journey steps before
the finally block, using accessible locators and explicit readiness conditions.
