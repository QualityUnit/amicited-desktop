# Marketer design

Marketer mode follows the AmICited dialect in the read-only reference
live cloud dashboard screenshots and the read-only flowhunt2 **origin/main export at 44d4019d4c** (`scratchpad/flowhunt2-main/frontend/src`). Reference screenshots win, then this export, then its DESIGN.md. The local flowhunt2 working branch is stale and is not a design source. Its Signal Blue accent,
neutral ground and hairlines apply only below
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
brand accent. Inter, Geist, Geist Mono and Fraunces are bundled with OFL notices and
provenance in the marketing package. Inter at 14px styles chrome; Fraunces is reserved for first launch. Section
heads use Geist and comparable figures use Geist Mono. Unknown values use an
em dash. Unavailable checks use amber with warning ink.

`MarketingUiContext` supplies T3 Button, Input and Textarea; existing Switch and
task controls use the same theme. `KpiTile` and `SectionHead` compose semantic
containers (upstream has no Card primitive). Nav rows use an accent wash;
visibility brand rows reserve the accent for “you” and start competitors at the
second series color. Results show only measured figures, without invented trends.

App cards follow `components/amicited/ui/cardFrame.ts`: 12px corners, a hairline, surface fill and no shadow, with 20px padding (16px on phones). Status strips follow `StatusNotification.tsx` and the reference: 8px corners, a plain surface and 14px horizontal / 12px vertical padding. Severity badges use `dashboard/status/severityStyles.ts` soft critical and warning colours. Inputs use 8px corners,
navigation rows 9px, and mono status tags 2px. Content has fluid 24px gutters.
