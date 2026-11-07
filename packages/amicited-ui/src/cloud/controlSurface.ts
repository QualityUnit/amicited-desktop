// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/ui/controlSurface.ts.
import { twMerge } from "tailwind-merge";

export const CONTROL_SURFACE =
  "block w-full border border-gray-200 amicited:border-ai-surf-2 bg-white amicited:bg-ai-surf text-[13px] font-normal text-gray-900 amicited:text-ai-ink shadow-none outline-hidden transition-colors duration-150 placeholder:text-gray-400 amicited:placeholder:text-ai-ink-4 not-disabled:hover:border-gray-900/14 amicited:not-disabled:hover:border-ai-line-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

export const CONTROL_FOCUS =
  "focus:border-primary-500 amicited:focus:border-ui-accent not-disabled:hover:focus:border-primary-500 amicited:not-disabled:hover:focus:border-ui-accent focus:ring-3 focus:ring-primary-500/10 amicited:focus:ring-ui-accent/10";

export const CONTROL_FOCUS_WITHIN =
  "focus-within:border-primary-500 amicited:focus-within:border-ui-accent hover:focus-within:border-primary-500 amicited:hover:focus-within:border-ui-accent focus-within:ring-3 focus-within:ring-primary-500/10 amicited:focus-within:ring-ui-accent/10";

export const CONTROL_INVALID =
  "border-ui-bad amicited:border-ui-bad ring-3 ring-ui-bad/10 amicited:ring-ui-bad/10 not-disabled:hover:border-ui-bad amicited:not-disabled:hover:border-ui-bad focus:border-ui-bad amicited:focus:border-ui-bad not-disabled:hover:focus:border-ui-bad amicited:not-disabled:hover:focus:border-ui-bad focus:ring-ui-bad/10 amicited:focus:ring-ui-bad/10";

export const CONTROL_READ_ONLY =
  "bg-gray-50 amicited:bg-ai-surf-hover text-gray-700 amicited:text-ai-ink-2 not-disabled:hover:border-gray-200 amicited:not-disabled:hover:border-ai-surf-2";

export const CONTROL_MONO = "font-ui-mono";

export const CONTROL_SIZE = {
  md: "h-8 rounded-lg px-2.5 py-0",
  sm: "h-7 rounded-lg px-2.5 py-0",
  lg: "h-11.5 rounded-xl px-2.5 py-0",
} as const;

export const CONTROL_INNER_HEIGHT = {
  md: "[&_[data-kit=text-input]]:h-7.5",
  sm: "[&_[data-kit=text-input]]:h-6.5",
} as const satisfies Record<CompactControlSize, string>;

export type ControlSize = keyof typeof CONTROL_SIZE;

export type CompactControlSize = Exclude<ControlSize, "lg">;

export const CONTROL_AREA = "[&:is(textarea)]:h-auto [&:is(textarea)]:py-2";

export const isInvalid = (
  invalid: boolean | undefined,
  ariaInvalid: boolean | "true" | "false" | undefined,
): boolean => Boolean(invalid) || ariaInvalid === true || ariaInvalid === "true";

export const CONTROL_CLEAR =
  "pointer-events-auto flex size-5 items-center justify-center rounded-md text-gray-400 amicited:text-ai-ink-4 transition-colors duration-150 hover:bg-gray-200/70 amicited:hover:bg-ai-surf-2/70 hover:text-gray-700 amicited:hover:text-ai-ink-2 focus-visible:ring-2 focus-visible:ring-primary-500 amicited:focus-visible:ring-ui-accent focus-visible:outline-none motion-reduce:transition-none";
export const CONTROL_CLEAR_SHOWN =
  "visible opacity-100 transition-[opacity,visibility] duration-200 ease-enter";
export const CONTROL_CLEAR_HIDDEN =
  "invisible opacity-0 transition-[opacity,visibility] duration-200 ease-exit";

export const FILTER_TRIGGER_BASE =
  "flex items-center gap-1.5 text-left whitespace-nowrap outline-hidden disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
const FILTER_TRIGGER_RING =
  "focus-visible:ring-primary-500 amicited:focus-visible:ring-ui-accent focus-visible:ring-2 focus-visible:ring-offset-2";
const FILTER_TRIGGER_LOOK =
  "max-w-full rounded-lg border px-3 text-body font-medium text-gray-900 amicited:text-ai-ink transition-colors duration-150";
const FILTER_TRIGGER_SIZE = { md: "h-8", sm: "h-7" } as const;
const FILTER_TRIGGER_REST =
  "border-gray-200 amicited:border-ai-surf-2 bg-white amicited:bg-ai-surf hover:bg-gray-50 amicited:hover:bg-ai-surf-hover";
export const SELECTED_LOOK =
  "border-primary-300 amicited:border-ui-accent/35 bg-primary-50 amicited:bg-ui-accent/10";
const FILTER_TRIGGER_ACTIVE = `${SELECTED_LOOK} duration-200 hover:bg-primary-100 amicited:hover:bg-ui-accent/15`;
export const FILTER_TRIGGER_INVALID =
  "border-ui-bad amicited:border-ui-bad ring-3 ring-ui-bad/10 amicited:ring-ui-bad/10";

export const filterTrigger = (size: CompactControlSize, active: boolean): string =>
  twMerge(
    FILTER_TRIGGER_BASE,
    FILTER_TRIGGER_RING,
    FILTER_TRIGGER_LOOK,
    FILTER_TRIGGER_SIZE[size],
    active ? FILTER_TRIGGER_ACTIVE : FILTER_TRIGGER_REST,
  );

export interface ControlSurfaceOptions {
  size?: ControlSize;
  invalid?: boolean;
  mono?: boolean;
  readOnly?: boolean;
}

export const controlSurface = ({
  size = "md",
  invalid = false,
  mono = false,
  readOnly = false,
}: ControlSurfaceOptions = {}): string =>
  twMerge(
    CONTROL_SURFACE,
    CONTROL_SIZE[size],
    CONTROL_FOCUS,
    readOnly && CONTROL_READ_ONLY,
    invalid && CONTROL_INVALID,
    mono && CONTROL_MONO,
  );
