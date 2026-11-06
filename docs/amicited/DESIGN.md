# Marketer design

Marketer mode follows the AmICited dialect in the read-only reference
`flowhunt2/DESIGN.md` and dashboard `metrics/theme.ts`. Its Signal Blue accent,
neutral ground, hairlines and seam shadows apply only below
`[data-amicited-shell]`. Developer mode retains the upstream theme.

| AmICited token                         | T3 theme variable                                           |
| -------------------------------------- | ----------------------------------------------------------- |
| `--ai-bg`                              | `--background`                                              |
| `--ai-surf`                            | `--card`, `--popover`                                       |
| `--ai-ink`                             | `--foreground`, `--card-foreground`, `--popover-foreground` |
| `--ai-accent`                          | `--primary`, `--ring`                                       |
| `--ai-accent-soft` / `--ai-accent-ink` | `--accent` / `--accent-foreground`                          |
| `--ai-surf-2` / `--ai-ink-3`           | `--muted` / `--muted-foreground`                            |
| `--ai-line` / `--ai-line-2`            | `--border` / `--input`                                      |
| `--font-ai-sans` / `--font-ai-mono`    | `--font-sans` / `--font-mono`                               |

The dark ancestor changes neutral and status ink ramps without changing the
brand accent. Geist, Geist Mono and Fraunces are bundled with OFL notices and
provenance in the marketing package. Page headings use Fraunces once; section
heads use Geist and comparable figures use Geist Mono. Unknown values use an
em dash. Unavailable checks use amber with warning ink.

`MarketingUiContext` supplies T3 Button, Input and Textarea; existing Switch and
task controls use the same theme. `KpiTile` and `SectionHead` compose semantic
containers (upstream has no Card primitive). Nav rows use an accent wash;
visibility brand rows reserve the accent for “you” and start competitors at the
second series color. Results show only measured figures, without invented trends.
