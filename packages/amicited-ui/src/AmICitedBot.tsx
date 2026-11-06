"use client";

import { useId, type FC } from "react";

export type AmICitedBotMood = "happy" | "concerned" | "watch" | "busy";
export type AmICitedBotVariant = "filled" | "outlined";

interface AmICitedBotProps {
  mood: AmICitedBotMood;
  variant?: AmICitedBotVariant;
  size?: number;
  /** Accessible name; the bot is decorative when omitted. */
  label?: string;
}

const BRAND = "#2540d9";
const BRAND_DEEP = "#1a2fb0";

/** The antenna light carries the status, whatever the face says. */
const LIGHT: Record<AmICitedBotMood, string> = {
  happy: "#12a150",
  concerned: "#e5484d",
  watch: "#f7a93d",
  busy: "#9ca3af",
};

/**
 * The AmICited bot: the logo's bar chart given a face. Its antenna light is the
 * status and its face is the mood. Filled for the alert states, outlined for
 * the quiet ones, so the strip's loudness shows in the bot too.
 */
export const AmICitedBot: FC<AmICitedBotProps> = ({
  mood,
  variant = "filled",
  size = 36,
  label,
}) => {
  // `useId` may contain characters a `url(#…)` reference cannot carry.
  const stripesId = `amicited-bot-${useId().replace(/[^\w-]/g, "")}`;
  const outlined = variant === "outlined";
  const fg = outlined ? BRAND : "#ffffff";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <defs>
        <pattern
          id={stripesId}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="4" stroke="#ffffff" strokeWidth=".6" strokeOpacity=".35" />
        </pattern>
      </defs>
      <line x1="20" y1="9" x2="20" y2="4.5" stroke={BRAND} strokeWidth="2" strokeLinecap="round" />
      <rect x="17.5" y="1" width="5" height="5" rx="1" fill={LIGHT[mood]} />
      <rect
        x="4"
        y="9"
        width="32"
        height="28"
        rx="8"
        fill={outlined ? "#ffffff" : BRAND}
        stroke={BRAND}
        strokeWidth={outlined ? 2 : 0}
      />
      {outlined ? null : (
        <rect x="4" y="9" width="32" height="28" rx="8" fill={`url(#${stripesId})`} opacity=".35" />
      )}
      {[1.5, 36].map((x) => (
        <rect
          key={x}
          x={x}
          y="19"
          width="2.5"
          height="8"
          rx="1.25"
          fill={outlined ? "#ffffff" : BRAND_DEEP}
          stroke={BRAND}
          strokeWidth={outlined ? 1.4 : 0}
        />
      ))}

      {mood === "happy" ? (
        <g stroke={fg} strokeWidth="2.4" strokeLinecap="round">
          <path d="M11.5 21.5 Q14.5 17 17.5 21.5" />
          <path d="M22.5 21.5 Q25.5 17 28.5 21.5" />
          <path d="M14.5 27 Q20 32 25.5 27" />
          <circle cx="10.5" cy="26" r="1.6" fill="#ff9db0" stroke="none" opacity=".8" />
          <circle cx="29.5" cy="26" r="1.6" fill="#ff9db0" stroke="none" opacity=".8" />
          <path
            d="M34.5 3.5 L35.3 5.7 L37.5 6.5 L35.3 7.3 L34.5 9.5 L33.7 7.3 L31.5 6.5 L33.7 5.7 Z"
            fill={LIGHT.happy}
            stroke="none"
          />
        </g>
      ) : null}
      {mood === "concerned" ? (
        <g stroke={fg} strokeWidth="2" strokeLinecap="round">
          <path d="M11 15.5 L17 17.5" />
          <path d="M29 15.5 L23 17.5" />
          <rect x="12.5" y="19.5" width="3.4" height="6" rx="1.7" fill={fg} stroke="none" />
          <rect x="24.1" y="19.5" width="3.4" height="6" rx="1.7" fill={fg} stroke="none" />
          <path d="M15 31 Q17.5 28.8 20 31 Q22.5 33.2 25 31" />
        </g>
      ) : null}
      {mood === "watch" ? (
        <g stroke={fg} strokeWidth="2" strokeLinecap="round">
          <path d="M22.5 16.5 L28.5 15.5" />
          <rect x="14" y="20" width="3.4" height="6" rx="1.7" fill={fg} stroke="none" />
          <rect x="25.6" y="21.5" width="3.4" height="4.5" rx="1.7" fill={fg} stroke="none" />
          <path d="M16.5 31 H23.5" />
        </g>
      ) : null}
      {mood === "busy" ? (
        <g fill={fg}>
          <rect x="11.5" y="23" width="3" height="4" rx="1" />
          <rect x="16" y="20" width="3" height="7" rx="1" />
          <rect x="20.5" y="21.5" width="3" height="5.5" rx="1" opacity=".7" />
          <rect x="25" y="18" width="3" height="9" rx="1" opacity=".45" />
          <path d="M17 31.5 H23" stroke={fg} strokeWidth="2" strokeLinecap="round" opacity=".8" />
        </g>
      ) : null}
    </svg>
  );
};
