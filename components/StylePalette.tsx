"use client";

import { cardStyles } from "@/lib/styles/cards";
import { cn } from "@/lib/utils";

export function StylePalette({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Background style">
      {cardStyles.map((style) => (
        <button
          key={style.id}
          type="button"
          aria-label={style.label}
          aria-pressed={value === style.id}
          onClick={() => onChange(style.id)}
          className={cn("h-14 w-14 shrink-0 rounded-2xl", value === style.id && "ring-2 ring-white ring-offset-2 ring-offset-black")}
          style={{ background: style.background }}
        />
      ))}
    </div>
  );
}
