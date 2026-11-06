// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/page-header/headerButtonStyles.ts.

export const HEADER_BUTTON_RADIUS = "rounded-lg";

export const HEADER_BUTTON_BASE = `inline-flex h-8 shrink-0 items-center whitespace-nowrap ${HEADER_BUTTON_RADIUS} border px-3 text-[13px] font-medium text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:focus-visible:ring-offset-gray-700`;

export const HEADER_BUTTON_INACTIVE =
  "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600";

export const HEADER_BUTTON_ACTIVE =
  "border-primary-300 bg-primary-50 text-gray-900 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-white dark:hover:bg-primary-900/50";

export const HEADER_FILTER_MUTED = "text-gray-500 dark:text-gray-400";

export const HEADER_FILTER_CAPTION = `${HEADER_FILTER_MUTED} font-medium`;

export const HEADER_FILTER_MUTED_ICON = "text-gray-500! dark:text-gray-400!";

export const HEADER_CLEAR_X = "size-5 p-0 text-gray-500 dark:text-gray-400 [&>svg]:size-[13px]";

export const HEADER_ROW_MIN_H = "min-h-13";
