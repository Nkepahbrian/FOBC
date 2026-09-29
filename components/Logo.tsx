import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  title?: string;
};

const nodeAngles = [0, 60, 120, 180, 240, 300];

export function Logo({
  className,
  showWordmark = true,
  title = "FOBC",
}: LogoProps) {
  const rawId = useId().replace(/:/g, "");
  const gold = `fobc-gold-${rawId}`;
  const glow = `fobc-glow-${rawId}`;
  const shine = `fobc-shine-${rawId}`;
  const bloom = `fobc-bloom-${rawId}`;

  return (
    <svg
      viewBox={showWordmark ? "0 0 470 128" : "0 0 128 128"}
      role="img"
      aria-label={title}
      className={cn("h-12 w-auto", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gold} x1="24" y1="18" x2="108" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="38%" stopColor="#FBBF24" />
          <stop offset="72%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <radialGradient id={glow} cx="64" cy="64" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={shine} x1="64" y1="28" x2="64" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={bloom} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="4" y="4" width="120" height="120" rx="36" fill="#0F172A" />
      <circle cx="64" cy="64" r="48" fill={`url(#${glow})`} />
      <circle cx="64" cy="64" r="46" fill="none" stroke="#FBBF24" strokeOpacity="0.35" strokeWidth="1" />

      {Array.from({ length: 12 }).map((_, index) => (
        <line
          key={index}
          x1="64"
          y1="24"
          x2="64"
          y2={index % 2 === 0 ? "10" : "16"}
          stroke={`url(#${gold})`}
          strokeWidth={index % 2 === 0 ? "1.8" : "1"}
          strokeLinecap="round"
          transform={`rotate(${index * 30} 64 64)`}
          opacity={index % 2 === 0 ? "1" : "0.55"}
        />
      ))}

      {nodeAngles.map((angle) => {
        const radians = ((angle - 90) * Math.PI) / 180;
        const cx = 64 + Math.cos(radians) * 46;
        const cy = 64 + Math.sin(radians) * 46;

        return (
          <g key={angle}>
            <circle cx={cx} cy={cy} r="4.2" fill="#0F172A" stroke="#FBBF24" strokeWidth="1.4" />
            <circle cx={cx} cy={cy} r="1.5" fill="#FBBF24" />
          </g>
        );
      })}

      <g filter={`url(#${bloom})`}>
        <rect x="56" y="30" width="16" height="68" rx="5" fill={`url(#${gold})`} />
        <rect x="30" y="56" width="68" height="16" rx="5" fill={`url(#${gold})`} />
      </g>
      <rect x="60" y="34" width="4" height="28" rx="2" fill={`url(#${shine})`} opacity="0.55" />
      <circle cx="64" cy="64" r="8" fill="#FFFFFF" />
      <circle cx="64" cy="64" r="4.2" fill="#0F172A" />
      <circle cx="64" cy="64" r="1.6" fill="#FBBF24" />

      {showWordmark ? (
        <g>
          <text
            x="142"
            y="62"
            fill="#0F172A"
            fontFamily="Segoe UI, ui-sans-serif, system-ui, sans-serif"
            fontSize="46"
            fontWeight="800"
            letterSpacing="4"
          >
            FOBC
          </text>
          <text
            x="144"
            y="90"
            fill="#B45309"
            fontFamily="Segoe UI, ui-sans-serif, system-ui, sans-serif"
            fontSize="13"
            fontWeight="600"
            letterSpacing="1.15"
          >
            Festival of Blessings Community
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export default Logo;
