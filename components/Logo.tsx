import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  title?: string;
};

export function Logo({
  className,
  showWordmark = true,
  title = "FOBC",
}: LogoProps) {
  const rawId = useId().replace(/:/g, "");
  const gold = `fobc-gold-${rawId}`;
  const glow = `fobc-glow-${rawId}`;
  const rays = `fobc-rays-${rawId}`;

  return (
    <svg
      viewBox={showWordmark ? "0 0 440 96" : "0 0 96 96"}
      role="img"
      aria-label={title}
      className={cn("h-12 w-auto", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gold} x1="18" y1="14" x2="78" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="42%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <radialGradient id={glow} cx="48" cy="48" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <g id={rays}>
          {Array.from({ length: 12 }).map((_, index) => (
            <line
              key={index}
              x1="48"
              y1="16"
              x2="48"
              y2="6"
              stroke={`url(#${gold})`}
              strokeWidth="1.6"
              strokeLinecap="round"
              transform={`rotate(${index * 30} 48 48)`}
            />
          ))}
        </g>
      </defs>

      <rect width="96" height="96" rx="28" fill="#0F172A" />
      <circle cx="48" cy="48" r="34" fill={`url(#${glow})`} />
      <use href={`#${rays}`} opacity="0.9" />

      <path
        fill={`url(#${gold})`}
        d="M43.2 18h9.6c1.4 0 2.4 1.1 2.4 2.5v16.3h16.3c1.4 0 2.5 1 2.5 2.4v9.6c0 1.4-1.1 2.4-2.5 2.4H55.2v16.3c0 1.4-1 2.5-2.4 2.5h-9.6c-1.4 0-2.4-1.1-2.4-2.5V51.2H24.5c-1.4 0-2.5-1-2.5-2.4v-9.6c0-1.4 1.1-2.4 2.5-2.4h16.3V20.5c0-1.4 1-2.5 2.4-2.5Z"
      />
      <circle cx="48" cy="48" r="5.5" fill="#FFFFFF" />
      <circle cx="48" cy="48" r="2.4" fill="#0F172A" />

      {showWordmark ? (
        <g>
          <text
            x="116"
            y="52"
            fill="#0F172A"
            fontFamily="Segoe UI, ui-sans-serif, system-ui, sans-serif"
            fontSize="40"
            fontWeight="700"
            letterSpacing="3"
          >
            FOBC
          </text>
          <text
            x="118"
            y="74"
            fill="#F59E0B"
            fontFamily="Segoe UI, ui-sans-serif, system-ui, sans-serif"
            fontSize="11"
            fontWeight="600"
            letterSpacing="2.4"
          >
            FESTIVAL OF BLESSINGS
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export default Logo;
