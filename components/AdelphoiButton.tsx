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
  const [warning, setWarning] = useState("");
  if (ready && (!me || me === userId)) return null;

  const connected = override ?? (ready && ids.has(userId));
  const label = connected ? "Following" : followBack ? "Follow back Adelphos" : "Follow Adelphos";

  return (
    <div className={variant === "prominent" ? "w-full" : "inline-flex flex-col items-end"}>
    <button
      type="button"
      disabled={pending}
      aria-pressed={connected}
      aria-label={connected ? "Following" : label}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !connected;
        setWarning("");
        setOverride(next);
        onChange?.(next ? 1 : -1);
        setPending(true);
        try {
          await ensureAdelphoiLoaded();
          const viewer = getAdelphoiSnapshot();
          if (!viewer.me || viewer.me === userId) {
            setOverride(null);
            onChange?.(next ? -1 : 1);
            const message = viewer.me ? "" : "Sign in to follow Adelphos.";
            if (message) {
              console.error(message);
              setWarning(message);
            }
            return;
          }
          const result = await toggleAdelphoi(userId, name, next);
          if (!result.status) {
            setOverride(connected);
            onChange?.(next ? -1 : 1);
            if (result.warning) setWarning(result.warning);
            return;
          }
          setOverride(null);
          setWarning("");
        } catch (error) {
          console.error("Follow button failed:", error);
          setOverride(connected);
          onChange?.(next ? -1 : 1);
          setWarning("Could not update follow. Try again.");
        } finally {
          setPending(false);
        }
      }}
      title={warning || label}
      className={cn(
        "font-semibold disabled:opacity-60",
        warning && "ring-1 ring-red-400",
        variant === "prominent"
          ? connected
            ? "h-11 w-full rounded-lg border border-zinc-700 bg-transparent text-sm text-zinc-200"
            : "h-11 w-full rounded-lg bg-[#EAB308] text-sm text-black"
          : connected
            ? "h-7 shrink-0 rounded-full border border-zinc-700 bg-transparent px-2.5 text-[11px] text-zinc-200"
            : "h-7 shrink-0 rounded-full bg-[#EAB308] px-2.5 text-[11px] text-black"
      )}
    >
      {label}
    </button>
      {warning ? (
        <p role="alert" className="mt-1 text-center text-xs text-red-300">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
