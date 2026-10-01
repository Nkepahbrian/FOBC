"use client";

import type { ReactNode } from "react";
import { cardStyleById } from "@/lib/styles/cards";
import { cn } from "@/lib/utils";

export function ThoughtCard({
  text,
  styleId,
  className,
  children,
}: {
  text?: string;
  styleId: string;
  className?: string;
  children?: ReactNode;
}) {
  const style = cardStyleById(styleId);
  return (
    <div
      className={cn("flex min-h-[280px] items-center justify-center rounded-2xl px-6 py-10", className)}
      style={{ background: style.background, color: style.color }}
    >
      {children ?? <p className="whitespace-pre-wrap text-center text-3xl font-bold leading-tight">{text}</p>}
    </div>
  );
}
