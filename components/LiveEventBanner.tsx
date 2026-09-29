"use client";

import { Radio } from "lucide-react";
import type { LiveEvent } from "@/lib/feed/types";
import { isLiveEvent } from "@/lib/feed/types";

type LiveEventBannerProps = {
  events: LiveEvent[];
  isLiveActive?: boolean;
};

export function LiveEventBanner({ events, isLiveActive = false }: LiveEventBannerProps) {
  if (!isLiveActive) return null;

  const live = events.find((event) => isLiveEvent(event));
  if (!live) return null;

  const streamUrl = live.streamUrl || "https://www.youtube.com";

  return (
    <section className="bg-[#0F172A] text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F59E0B]">
            <Radio className="h-3.5 w-3.5 shrink-0" />
            Streaming live
          </div>
          <h2 className="truncate text-sm font-semibold">{live.title}</h2>
        </div>
        <a
          href={streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-[#F59E0B] px-3 py-2 text-xs font-semibold text-[#0F172A] transition hover:bg-[#FBBF24]"
        >
          Join Live Stream
        </a>
      </div>
    </section>
  );
}
