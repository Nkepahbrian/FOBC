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
      const result = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", id)
        .eq("is_read", false);
      if (!cancelled && !result.error) setCount(result.count ?? 0);
    }

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? "";
      if (userId) refresh(userId);
    });

    const channel = supabase
      .channel("fobc-unread-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (userId) refresh(userId);
      })
      .subscribe();

    function onFocus() {
      if (document.visibilityState === "hidden" || !userId) return;
      refresh(userId);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

export async function markConversationRead(me: string, otherId: string) {
  if (!me || !otherId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  await supabase.from("messages").update({ is_read: true }).eq("receiver_id", me).eq("sender_id", otherId).eq("is_read", false);
}
