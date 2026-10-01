"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import type { CarouselSlide } from "@/components/MediaCarousel";

export function MediaLightbox({
  slide,
  muted,
  onClose,
  corner,
}: {
  slide: CarouselSlide;
  muted: boolean;
  onClose: () => void;
  corner?: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Media">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-10 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm font-semibold text-white"
      >
        Close
        <X className="h-4 w-4" />
      </button>
      {slide.type === "video" ? (
        <video
          src={slide.url}
          muted={muted}
          loop
          playsInline
          autoPlay
          preload="auto"
          className="max-h-dvh w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.url} alt="" className="max-h-dvh w-full object-contain" />
      )}
      {corner ? <div className="absolute bottom-6 right-4 z-10">{corner}</div> : null}
    </div>
  );
}
