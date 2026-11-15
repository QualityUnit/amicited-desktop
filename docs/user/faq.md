# FAQ

## Is AmICited Desktop a harness?

No. A harness is what turns an LLM into an agent: it gives the model tools, a way to call them, runs them, and hands the results back. Claude Code is an interface (the TUI, the Code tab in the desktop app) plus a harness underneath (the Anthropic Agent SDK). Codex is the same split: the app plus the Codex App Server. AmICited Desktop uses those harnesses. It is not a harness, and it does not work without one.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Pi, or Muse Code. [Provider setup](./install.md#providers)

## Can I use AmICited Desktop with my Claude Code subscription?

Yes. You bring your own subscription, and you keep paying your provider as you already do. [Install](./install.md)

## What does AmICited Desktop cost?

You pay your AI provider as you already do. Local marketing tools work without an AmICited account. Connecting one adds AmICited tools that use workspace credits, and paid plans unlock the full set. [AmICited accounts and plans](./amicited.md#connect-amicited)

## Why is my Claude 5-hour limit draining so fast?

AmICited Desktop drives Claude through Anthropic's Agent SDK. Agent SDK usage can drain 5-hour limits faster than using Claude Code directly. This does not affect weekly limits.

## How do I use AmICited Desktop remotely?

Your agents run wherever AmICited Desktop runs: your desktop, a server, a VPS. You connect to it from another device. Run `amicited up` on that machine, or pair over LAN or Tailscale. AmICited Link is not available yet. [Remote access](./remote-access.md)

## Can I use AmICited Desktop on my phone?

The AmICited mobile app is not published yet. The phone is only a remote: your computer does the work and needs to stay on. [Mobile app](./install.md#mobile-app) · [Remote access](./remote-access.md)

## Why does my remote connection keep dropping?

Open **Settings > Environments**, find the machine, and select **Details**. The first part marked as failed is the cause. Tailscale makes a good fallback. [AmICited Link troubleshooting](./amicited-link-troubleshooting.md)

## Will I get banned for using my subscription?

AmICited Desktop runs each provider through its official CLI, SDK, or ACP binding, the same way the provider's own tools do. Check your provider's terms for how they apply to your account.

## Can I add a bunch of accounts for one provider?

AmICited Desktop does not switch between accounts automatically. A separate work account is fine. Setup for two: [Codex](./providers-codex.md#use-multiple-accounts) · [Claude](./providers-claude.md#separate-accounts-or-configurations). For a bigger pool, manage them outside AmICited Desktop with a self-hosted proxy like [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI). After you set up a hub, AmICited Desktop can show its pooled limits under Usage. [Connect a hub](./usage.md#connect-a-cliproxyapi-hub)

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in Settings and give it its own keys and endpoint. Claude has a full OpenRouter recipe. Your subscription setup stays untouched. [OpenRouter](./providers-claude.md#openrouter) · [Provider instances](./install.md#providers)

## Does AmICited Desktop support local models?

No. AmICited Desktop works through the providers listed in [Provider setup](./install.md#providers).

## Does my work go to AmICited's servers?

Not your prompts or files. They go from your machine to your provider (Anthropic, OpenAI, etc.). Tools you run from a connected AmICited account send what that tool needs to AmICited. AmICited Desktop also sends basic product usage events (provider, model, token totals, that kind of thing), with no prompts and no file contents. You can turn them off. [Product usage data](./telemetry.md)

## Worktrees are eating my disk. How do I clean them up?

Open **Settings > Storage** and turn on automatic worktree cleanup. You can also run it now from there. [Storage cleanup](./project-settings.md#storage-cleanup)

## Is there voice input?

Only in the mobile app, which is not published yet: on iPhone with iOS 26 or later and on Android 12 or later. Web and desktop do not have it yet. [Voice input on mobile](./composer.md#voice-input-on-mobile)

## Does it work on Windows, Mac, and Linux?

Yes, all three: desktop app and CLI. There is no `amicited` binary for Intel Macs, so use the desktop app there. On Windows you can also run agents inside WSL. [Install](./install.md)

## Why is my provider not showing up?

Usually the CLI is not installed or not on the `PATH` of the machine that runs the server (the computer, not your phone). Log in on that machine first, like `codex login` or `claude auth login`. Still missing? Point **Binary path** at it in provider settings. Version managers often cause this. [Provider setup](./install.md#providers)

## How do I get help?

Email [support@flowhunt.io](mailto:support@flowhunt.io). To report a problem, see [Triage an issue](./triage.md).
