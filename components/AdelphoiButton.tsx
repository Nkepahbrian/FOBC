"use client";

import { useState } from "react";
import { ensureAdelphoiLoaded, getAdelphoiSnapshot, toggleAdelphoi, useAdelphoi } from "@/lib/community/adelphoi";
import { cn } from "@/lib/utils";

export function AdelphoiButton({
  userId,
  name,
  variant = "compact",
  followBack = false,
  onChange,
}: {
  userId: string;
  name: string;
  variant?: "compact" | "prominent";
  followBack?: boolean;
  onChange?: (delta: 1 | -1) => void;
}) {
  const { me, ids, ready } = useAdelphoi();
  const [pending, setPending] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);
  if (ready && (!me || me === userId)) return null;

  const connected = override ?? (ready && ids.has(userId));
  const label = connected
    ? "Following"
    : variant === "compact"
      ? "Follow Adelphos"
      : followBack
        ? "Follow back Adelphos"
        : "Follow Adelphoi";

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={connected}
      aria-label={connected ? "Following" : label}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !connected;
        setOverride(next);
        onChange?.(next ? 1 : -1);
        setPending(true);
        await ensureAdelphoiLoaded();
        const viewer = getAdelphoiSnapshot();
        if (!viewer.me || viewer.me === userId) {
          setPending(false);
          setOverride(null);
          onChange?.(next ? -1 : 1);
          return;
        }
        const result = await toggleAdelphoi(userId, name);
        setPending(false);
        if (!result) {
          setOverride(connected);
          onChange?.(next ? -1 : 1);
          return;
        }
        setOverride(null);
      }}
      className={cn(
        "font-semibold disabled:opacity-60",
        variant === "prominent"
          ? connected
            ? "h-11 w-full rounded-lg border border-white/20 bg-transparent text-sm text-white"
            : "h-11 w-full rounded-lg bg-[#EAB308] text-sm text-black"
          : connected
            ? "h-7 shrink-0 rounded-full border border-white/25 bg-transparent px-2.5 text-[11px] text-white"
            : "h-7 shrink-0 rounded-full bg-[#EAB308] px-2.5 text-[11px] text-black"
      )}
    >
      {label}
    </button>
  );
}
