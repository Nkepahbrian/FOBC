"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CarouselSlide = {
  url: string;
  type: "image" | "video";
};

export function MediaCarousel({
  slides,
  className,
  overlay,
  onActivate,
  corner,
}: {
  slides: CarouselSlide[];
  className?: string;
  overlay?: ReactNode;
  onActivate?: () => void;
  corner?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  function onScroll() {
    const node = scroller.current;
    if (!node || node.clientWidth === 0) return;
    setIndex(Math.round(node.scrollLeft / node.clientWidth));
  }

  function goTo(next: number) {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  if (slides.length === 0) return null;

  return (
    <div className={className}>
      <div
        className="relative"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          onActivate?.();
        }}
      >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto rounded-2xl bg-black"
      >
        {slides.map((slide) => (
          <div key={slide.url} className="h-full w-full shrink-0 snap-center">
            {slide.type === "video" ? (
              <video
                src={slide.url}
                muted
                loop
                playsInline
                preload="metadata"
                className="pointer-events-none h-full w-full rounded-2xl object-cover"
                style={{ objectFit: "cover" }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slide.url} alt="" loading="lazy" className="h-full w-full rounded-2xl object-cover" style={{ objectFit: "cover" }} />
            )}
          </div>
        ))}
      </div>
      {overlay ? <div className="absolute bottom-3 left-3 right-3">{overlay}</div> : null}
      {corner ? <div className="absolute bottom-3 right-3 z-10">{corner}</div> : null}
      </div>
      {slides.length > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-label="Media pages">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.url}
              type="button"
              aria-label={`Show media ${slideIndex + 1}`}
              onClick={() => goTo(slideIndex)}
              className={cn("h-1.5 w-1.5 rounded-full", slideIndex === index ? "bg-white" : "bg-white/35")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
