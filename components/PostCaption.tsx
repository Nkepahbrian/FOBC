"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function PostCaption({ text, className }: { text: string; className?: string }) {
  const clean = text.trim();
  const [expanded, setExpanded] = useState(false);
  const [lineOverflow, setLineOverflow] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const overCharacters = clean.length > 200;
  const overBreaks = clean.split("\n").length > 4;

  useLayoutEffect(() => {
    setExpanded(false);
    setLineOverflow(false);
  }, [clean]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || overCharacters || overBreaks) return;
    const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
    if (!lineHeight) return;
    setLineOverflow(Math.round(node.scrollHeight / lineHeight) > 4);
  }, [clean, overCharacters, overBreaks]);

  if (!clean) return null;

  const canToggle = overCharacters || overBreaks || lineOverflow;
  const shown = !expanded && overCharacters ? `${clean.slice(0, 200).trimEnd()}` : clean;

  return (
    <div className={className}>
      <p ref={ref} className={cn("whitespace-pre-wrap", !expanded && canToggle && "line-clamp-4")}>
        {shown}
      </p>
      {canToggle ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          className="mt-1 text-sm font-semibold text-[#EAB308]"
        >
          {expanded ? "Read less" : "...Read more"}
        </button>
      ) : null}
    </div>
  );
}
