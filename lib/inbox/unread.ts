"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function useUnreadMessages() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    let userId = "";
    let cancelled = false;

    async function refresh(id: string) {
      const flagged = await supabase.from("messages").select("id, is_read").eq("receiver_id", id);
      if (cancelled) return;
      if (!flagged.error) {
        const unread = (flagged.data ?? []).filter((row) => (row as { is_read?: boolean }).is_read !== true).length;
        setCount(unread);
        return;
      }
      if (/is_read/i.test(flagged.error.message)) {
        const plain = await supabase.from("messages").select("id").eq("receiver_id", id);
        if (!cancelled && !plain.error) setCount(plain.data?.length ?? 0);
        return;
      }
      const head = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", id)
        .eq("is_read", false);
      if (!cancelled && !head.error) setCount(head.count ?? 0);
    }

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? "";
      if (userId) refresh(userId);
    });

    const channel = supabase
      .channel("fobc-unread-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? {}) as { receiver_id?: string; is_read?: boolean };
        if (row.receiver_id && row.receiver_id === userId && row.is_read !== true) {
          refresh(userId);
          return;
        }
        if (userId) refresh(userId);
      })
      .subscribe();

    const timer = window.setInterval(() => {
      if (userId) refresh(userId);
    }, 8000);

    function onFocus() {
      if (document.visibilityState === "hidden" || !userId) return;
      refresh(userId);
    }
    function onRead() {
      if (userId) refresh(userId);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("fobc-messages-read", onRead);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("fobc-messages-read", onRead);
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

export async function markConversationRead(me: string, otherId: string) {
  if (!me || !otherId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  const updated = await supabase.from("messages").update({ is_read: true }).eq("receiver_id", me).eq("sender_id", otherId).eq("is_read", false);
  if (updated.error && /is_read/i.test(updated.error.message)) return;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fobc-messages-read"));
}
