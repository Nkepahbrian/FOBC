"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const READ_KEY = "fobc-read-message-ids";

type InboxRow = { id: string; sender_id: string; is_read?: boolean | null };

export function unreadThreadCount(rows: InboxRow[], readIds: Iterable<string>) {
  const read = new Set<string>();
  const source = Array.isArray(readIds) ? readIds : Array.from(readIds);
  for (const id of source) read.add(String(id));
  const senders = new Set<string>();
  for (const row of rows) {
    if (row.is_read === true || read.has(row.id)) continue;
    if (row.sender_id) senders.add(row.sender_id);
  }
  return senders.size;
}

function readIds() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READ_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
  } catch {
    return [];
  }
}

function rememberRead(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;
  const next = readIds();
  const seen = new Set(next);
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  window.localStorage.setItem(READ_KEY, JSON.stringify(next.slice(-800)));
}

export function useUnreadMessages() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    let userId = "";
    let cancelled = false;

    async function refresh(id: string) {
      const flagged = await supabase.from("messages").select("id, sender_id, is_read").eq("receiver_id", id);
      if (cancelled) return;
      if (!flagged.error) {
        setCount(unreadThreadCount((flagged.data ?? []) as InboxRow[], readIds()));
        return;
      }
      const plain = await supabase.from("messages").select("id, sender_id").eq("receiver_id", id);
      if (!cancelled && !plain.error) {
        setCount(unreadThreadCount((plain.data ?? []) as InboxRow[], readIds()));
      }
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
  const listed = await supabase.from("messages").select("id").eq("receiver_id", me).eq("sender_id", otherId);
  if (!listed.error) rememberRead((listed.data ?? []).map((row) => String(row.id)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fobc-messages-read"));

  const updated = await supabase.from("messages").update({ is_read: true }).eq("receiver_id", me).eq("sender_id", otherId);
  if (updated.error && !/is_read/i.test(updated.error.message)) {
    console.error("Could not mark messages read:", updated.error);
  }
  await supabase.rpc("mark_chat_read", { other_id: otherId });
}
