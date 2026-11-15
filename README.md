# AmICited Desktop

Local-first AI agent workstation for marketers, published by FlowHunt. It drives the AI providers a marketer already pays for (Claude, Codex, Gemini and others), controls a built-in Agent Browser and the computer, ships a library of free marketing tools, and connects to [AmICited](https://amicited.com) over MCP.

- Download: [amicited.com](https://amicited.com)
- [User guides](docs/README.md)
- Support: [support@flowhunt.io](mailto:support@flowhunt.io). Security reports: see [SECURITY.md](.github/SECURITY.md).

## For maintainers

AmICited Desktop is built on top of [T3 Code](https://github.com/pingdotgg/t3code) (MIT), imported with full upstream history (`upstream` remote = `pingdotgg/t3code`, merged weekly). The marketer layer lives in `@amicited/*` packages. Upstream's README is kept at [docs/upstream/T3CODE-README.md](docs/upstream/T3CODE-README.md).

- [Product and technical specification](docs/SPECIFICATION.md)
- [Contributing](CONTRIBUTING.md)
- [Agent workflow skills for maintainers](.agents/skills/README.md) (Claude Code and Codex)

The living version of the specification is edited in Claude Docs; `docs/SPECIFICATION.md` is a snapshot exported on 2026-11-05.

## License

MIT. See [LICENSE](LICENSE), which keeps T3 Tools' original copyright notice.
