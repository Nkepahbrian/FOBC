"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/Logo";

export function FeedHeader() {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-3">
        <Link href="/feed" aria-label="FOBC home" className="min-w-0">
          <Logo className="h-9" />
        </Link>
        <div className="flex shrink-0 items-center">
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F172A] transition hover:bg-slate-100"
          >
            <Search className="h-5 w-5" />
          </Link>
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F172A] transition hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
          </button>
        </div>
      </div>
      {notesOpen ? (
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">No notifications yet.</p>
      ) : null}
    </header>
  );
}
