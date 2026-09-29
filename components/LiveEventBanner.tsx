"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import type { LiveEvent } from "@/lib/feed/types";
import { isLiveEvent } from "@/lib/feed/types";

type LiveEventBannerProps = {
  events: LiveEvent[];
};

function parts(target: string, now: number) {
  const diff = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function Clock({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = parts(target, now);
  const units = [
    ["Days", time.days],
    ["Hrs", time.hours],
    ["Min", time.minutes],
    ["Sec", time.seconds],
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2" aria-live="polite">
      {units.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-white/10 px-2 py-2 text-center">
          <div className="text-lg font-semibold tabular-nums text-[#FBBF24]">
            {String(value).padStart(2, "0")}
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function LiveEventBanner({ events }: LiveEventBannerProps) {
  const now = Date.now();
  const live = events.find((event) => isLiveEvent(event, now));
  const upcoming = events
    .filter((event) => new Date(event.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const featured = live ?? upcoming;

  if (!featured) return null;

  const streamUrl = (live ?? featured).streamUrl || "https://www.youtube.com";

  return (
    <section className="bg-[#0F172A] text-white">
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[#0F172A] px-5 py-3 shadow-lg">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F59E0B]">
            <Radio className="h-3.5 w-3.5 shrink-0" />
            {live ? "Streaming live" : "Upcoming session"}
          </div>
          <h2 className="truncate text-sm font-semibold">
            {live ? `${live.title} - Streaming Live` : featured.title}
          </h2>
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
      {upcoming ? (
        <div className="px-5 pb-4">
          <p className="mb-2 text-xs text-slate-300">
            {live ? `Next: ${upcoming.title}` : upcoming.details || "Starts in"}
          </p>
          <Clock target={upcoming.startsAt} />
        </div>
      ) : null}
    </section>
  );
}
