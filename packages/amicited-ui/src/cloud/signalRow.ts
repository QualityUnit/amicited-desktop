// Ported from flowhunt2 origin/main 44d4019d4c: components/amicited/ui/signalRow.ts.
// Doc: docs/frontend/design/amicited/status-surfaces.md#signal_row_class
/**
 * The badge + text + action rows inside a status notification (the AEO, SEO
 * and Ads strips and the AI agent analysis banner). The list measures its own
 * width: from 640px a row is badge | text | action; from 384px the badge takes
 * its own line over the text and the action; narrower, all three stack.
 */
export const SIGNAL_LIST_CLASS = "@container/signals";

export const SIGNAL_ROW_CLASS =
  "grid grid-cols-1 items-start gap-x-3 gap-y-1 border-b border-[color-mix(in_srgb,var(--ai-ink)_6%,transparent)] px-4 py-2.5 last:border-b-0 @sm/signals:grid-cols-[minmax(0,1fr)_auto] @min-[40rem]/signals:grid-cols-[auto_minmax(0,1fr)_auto] @min-[40rem]/signals:items-center";

export const SIGNAL_BADGE_CLASS =
  "justify-self-start @sm/signals:col-span-2 @min-[40rem]/signals:col-span-1";

export const SIGNAL_ACTION_CLASS =
  "justify-self-start text-[13px] font-medium whitespace-nowrap text-blue-700 hover:underline @sm/signals:justify-self-end";

/** Holds the action column of a row that has no action, three-column only. */
export const SIGNAL_ACTION_SPACER_CLASS = "hidden @min-[40rem]/signals:block";
