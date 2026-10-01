"use client";

import { useState } from "react";
import { toggleAdelphoi, useAdelphoi } from "@/lib/community/adelphoi";
import { cn } from "@/lib/utils";

export function AdelphoiButton({
  userId,
  name,
  variant = "compact",
  onChange,
}: {
  userId: string;
  name: string;
  variant?: "compact" | "prominent";
  onChange?: (connected: boolean) => void;
}) {
  const { me, ids, ready } = useAdelphoi();
  const [pending, setPending] = useState(false);
  if (!ready || !me || me === userId) return null;

  const connected = ids.has(userId);
  const label = variant === "prominent" ? (connected ? "Unfollow Adelphoi" : "Follow Adelphoi") : connected ? "Adelphoi" : "Follow Adelphoi";

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={connected}
      aria-label={connected ? "Unfollow Adelphoi" : "Follow Adelphoi"}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPending(true);
        const result = await toggleAdelphoi(userId, name);
        setPending(false);
        if (result === "followed") onChange?.(true);
        if (result === "unfollowed") onChange?.(false);
      }}
      className={cn(
        "font-semibold disabled:opacity-60",
        variant === "prominent"
          ? connected
            ? "h-11 w-full rounded-lg bg-[#121212] text-sm text-white"
            : "h-11 w-full rounded-lg bg-[#EAB308] text-sm text-black"
          : connected
            ? "h-7 shrink-0 rounded-full border border-[#EAB308] px-2.5 text-[11px] text-[#EAB308]"
            : "h-7 shrink-0 rounded-full bg-[#EAB308] px-2.5 text-[11px] text-black"
      )}
    >
      {label}
    </button>
  );
}
