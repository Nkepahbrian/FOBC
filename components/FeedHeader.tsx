"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { SearchDrawer } from "@/components/SearchDrawer";
import { syncNotifications, useNotifications } from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function FeedHeader() {
  const [notesOpen, setNotesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifications = useNotifications();
  const unread = notifications.some((item) => !item.read);

  useEffect(() => {
    if (!getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) syncNotifications(data.user.id).catch(() => undefined);
    });
  }, []);

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Link href="/feed" aria-label="FOBC home" className="flex min-w-0 items-center gap-2">
          <Wordmark className="text-[2rem]" />
        </Link>
        <div className="flex shrink-0 items-center text-white">
          <button
            type="button"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => {
              setNotesOpen(false);
              setSearchOpen(true);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={notesOpen}
            onClick={() => {
              setSearchOpen(false);
              setNotesOpen(true);
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
          >
            <Bell className="h-5 w-5" />
            {unread ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#EAB308]" /> : null}
          </button>
        </div>
      </div>
    </header>
      {searchOpen ? <SearchDrawer onClose={() => setSearchOpen(false)} /> : null}
      {notesOpen ? (
        <div className="fixed inset-0 z-40 flex justify-center bg-black/70">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-b-[2rem] bg-[#0F172A] text-white shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="text-sm font-semibold text-[#EAB308]"
              >
                Close
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
              <NotificationsPanel active={notesOpen} />
            </div>
            <Link href="/notifications" onClick={() => setNotesOpen(false)} className="border-t border-white/10 px-4 py-4 text-center text-sm font-semibold text-[#EAB308]">
              Open notifications
            </Link>
          </section>
        </div>
      ) : null}
    </>
  );
}
