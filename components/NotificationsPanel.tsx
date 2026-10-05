"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { markNotificationRead, syncNotifications, useNotifications, type NotificationKind } from "@/lib/notifications/store";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const kindLabel: Record<NotificationKind, string> = {
  amen: "Amen",
  comment: "Blessing",
  share: "Share",
  adelphoi: "Adelphoi",
  system: "Update",
};

export function NotificationsPanel({ active = true }: { active?: boolean }) {
  const items = useNotifications();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (!getSupabaseEnv().isConfigured) {
      setSettled(true);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!cancelled && data.user) await syncNotifications(data.user.id);
      if (!cancelled) setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!settled && items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-400">Loading notifications...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-semibold text-white">No notifications yet</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Amens, comments, new Adelphoi, and system updates will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2 px-3">
      {items.map((item) => {
        const content = (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#EAB308]">{kindLabel[item.kind]}</p>
            <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
            <p className="mt-0.5 text-sm leading-5 text-zinc-300">{item.body}</p>
          </>
        );
        const className = cn("block rounded-2xl px-3 py-3 text-left", item.is_read ? "bg-transparent" : "bg-blue-500/15");
        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className={className}
                onClick={() => {
                  void markNotificationRead(item.id);
                }}
              >
                {content}
              </Link>
            ) : (
              <button type="button" onClick={() => void markNotificationRead(item.id)} className={cn(className, "w-full")}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
