// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/onboarding/onboardingStyles.ts.
// Shared Tailwind class strings for the AmICited onboarding right-panel
// controls. Centralised so the domain, prompts, and success steps stay visually
// consistent. Colours reference the dashboard design tokens (--ai-*).

export const inputClass =
  "h-[46px] w-full rounded-xl border border-[var(--ai-line-2)] bg-[var(--ai-surf)] px-3.5 text-[14px] text-[var(--ai-ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ai-ink-4)] hover:border-[rgba(17,25,40,.22)] focus:border-[var(--ai-accent)] focus:shadow-[0_0_0_3px_rgba(59,92,255,.14)]";

export const btnBase =
  "inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-medium transition active:translate-y-px disabled:cursor-not-allowed";

export const btnPrimary = `${btnBase} bg-[var(--ai-ink)] text-white hover:bg-black disabled:bg-[var(--ai-surf-3)] disabled:text-[var(--ai-ink-4)]`;

export const btnGhost = `${btnBase} border border-[var(--ai-line-2)] bg-transparent text-[var(--ai-ink-2)] hover:bg-[var(--ai-surf-2)] hover:text-[var(--ai-ink)]`;

export const btnText =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-transparent px-2 text-[14px] font-medium text-[var(--ai-ink-3)] transition hover:text-[var(--ai-ink)]";

export const MONO = "[font-family:var(--font-ai-mono)]";

export const eyebrowClass = `text-[11px] font-medium uppercase tracking-[.04em] text-[var(--ai-ink-3)] ${MONO}`;

export const headingClass =
  "mt-2 text-[27px] font-semibold leading-[1.1] tracking-[-0.02em] text-balance text-[var(--ai-ink)]";

export const ledeClass = "mt-2 max-w-[50ch] text-[13.5px] text-[var(--ai-ink-2)]";
