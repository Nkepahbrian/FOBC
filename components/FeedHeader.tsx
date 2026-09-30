"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Wordmark } from "@/components/Logo";

export function FeedHeader() {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Link href="/feed" aria-label="FOBC home" className="flex min-w-0 items-center gap-2">
          <Wordmark className="text-[2rem]" />
        </Link>
        <div className="flex shrink-0 items-center text-white">
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
          >
            <Search className="h-5 w-5" />
          </Link>
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
          >
            <Bell className="h-5 w-5" />
          </button>
        </div>
      </div>
      {notesOpen ? (
        <p className="border-t border-white/10 px-4 py-3 text-sm text-zinc-400">No notifications yet.</p>
      ) : null}
    </header>
  );
}
