import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  title?: string;
};

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("fobc-wordmark", className)}>FOBC</span>;
}

export function Logo({ className, showWordmark = false, title = "FOBC" }: LogoProps) {
  const rawId = useId().replace(/:/g, "");
  const gold = `fobc-gold-${rawId}`;
  const glow = `fobc-glow-${rawId}`;
  const bloom = `fobc-bloom-${rawId}`;

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg viewBox="0 0 128 128" role="img" aria-label={title} className="h-full w-auto" xmlns="http://www.w3.org/2000/svg">
        <title>{title}</title>
        <defs>
          <linearGradient id={gold} x1="28" y1="18" x2="100" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF7D6" />
            <stop offset="42%" stopColor="#F5C542" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <radialGradient id={glow} cx="64" cy="64" r="42" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F5C542" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#F5C542" stopOpacity="0" />
          </radialGradient>
          <filter id={bloom} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="128" height="128" rx="32" fill="#121212" />
        <circle cx="64" cy="64" r="46" fill={`url(#${glow})`} />
        <g stroke={`url(#${gold})`} strokeLinecap="round" fill="none">
          <path d="M64 18v10M64 100v10M18 64h10M100 64h10" strokeWidth="2" />
          <path d="M32 32l7 7M89 89l7 7M96 32l-7 7M39 89l-7 7" strokeWidth="1.4" opacity="0.8" />
        </g>
        <g filter={`url(#${bloom})`}>
          <rect x="56" y="20" width="16" height="84" rx="6" fill={`url(#${gold})`} />
          <rect x="28" y="56" width="72" height="16" rx="6" fill={`url(#${gold})`} />
        </g>
        <circle cx="64" cy="64" r="9" fill="#FFF8E7" />
        <circle cx="64" cy="64" r="4.5" fill="#121212" />
        <circle cx="64" cy="64" r="1.8" fill="#F5C542" />
      </svg>
      {showWordmark ? <Wordmark className="text-4xl" /> : null}
    </span>
  );
}

export default Logo;
