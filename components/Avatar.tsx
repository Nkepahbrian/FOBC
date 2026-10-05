"use client";

import { useEffect, useState } from "react";

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  base: "h-10 w-10 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

export function personInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "F";
}

export function Avatar({
  name,
  src,
  size = "md",
  fill = false,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  fill?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPhoto = Boolean(src) && !failed;
  const box = fill ? "h-full w-full text-sm" : sizes[size];

  if (showPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src ?? ""}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-full border-2 border-[#EAB308] bg-[#121212] font-semibold leading-none text-[#EAB308] ${className}`}
    >
      {personInitials(name)}
    </span>
  );
}
