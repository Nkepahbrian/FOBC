"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { markNotificationsRead, syncNotifications, useNotifications, type NotificationKind } from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const kindLabel: Record<NotificationKind, string> = {
  amen: "Amen",
  comment: "Blessing",
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
      if (!cancelled) {
        markNotificationsRead();
        setSettled(true);
      }
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
    <ul className="divide-y divide-white/10">
      {items.map((item) => {
        const content = (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#EAB308]">{kindLabel[item.kind]}</p>
            <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
            <p className="mt-0.5 text-sm leading-5 text-zinc-300">{item.body}</p>
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block px-4 py-3 text-left">
                {content}
              </Link>
            ) : (
              <div className="px-4 py-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
