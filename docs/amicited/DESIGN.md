# Marketer design

The marketer UI follows T3 Code’s design system. AmICited supplies the name and
mark; it does not supply a second theme. Fonts, colours, control variants, radii,
spacing and light/dark surfaces come from T3, including its near-black dark theme.
Developer mode retains the upstream presentation.

Marketer navigation reuses T3’s sidebar brand chrome and search row. Chat history
uses shell summaries, preserving rename, archive, restore and confirmed deletion
without loading each conversation. Footer destinations use quiet icon controls.
Project grouping and developer controls stay hidden in marketer mode.

The upstream breadcrumb, draft heading, composer and transcript supply the chat.
Website and subscription controls and four quiet starter suggestions sit below
the composer. Marketing checks use expandable T3 work rows, compact summaries
and links to the full result. Approval uses T3’s work row and permission actions
with plain-language copy. Errors and coverage limitations remain explicit.

Secondary pages render T3 SettingsGroup and SettingsRow through the UI adapter.
Categories use T3 ToggleGroup; disclosures use Collapsible and WorkLogButton.
The composer context is a portal into ContextStrip outside the painted Host.
Only the work row carries the check title, domain, score and status; expanded
content carries coverage, findings and actions. Numbers
use the interface font with tabular numerals. The inline AmICited offer keeps
the existing first-win gate, session frequency, snooze and hiding preferences;
local tools never require an account.
