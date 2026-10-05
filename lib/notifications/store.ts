"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type NotificationKind = "amen" | "comment" | "share" | "adelphoi" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  read: boolean;
};

type NotificationDraft = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt?: string;
  read?: boolean;
};

const STORAGE_KEY = "fobc-notifications";
const EMPTY: AppNotification[] = [];
const listeners = new Set<() => void>();
let items: AppNotification[] = EMPTY;

function emit() {
  listeners.forEach((listener) => listener());
}

function readStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppNotification[]) : [];
    items = Array.isArray(parsed) ? parsed.slice(0, 50) : EMPTY;
  } catch {
    items = EMPTY;
  }
}

function writeStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emit();
}

export function getNotificationsSnapshot() {
  return items;
}

export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let watching = false;

function ensureNotificationWatch() {
  if (watching || typeof window === "undefined" || !getSupabaseEnv().isConfigured) return;
  watching = true;
  const supabase = createClient();
  supabase.auth.getUser().then(({ data }) => {
    const userId = data.user?.id;
    if (!userId) return;
    syncNotifications(userId).catch(() => undefined);
    supabase
      .channel(`fobc-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => {
          syncNotifications(userId).catch(() => undefined);
        }
      )
      .subscribe();
  });
}

export function useNotifications() {
  const list = useSyncExternalStore(subscribeNotifications, getNotificationsSnapshot, () => EMPTY);
  useEffect(() => {
    readStorage();
    emit();
    ensureNotificationWatch();
  }, []);
  return list;
}

export function recordNotification(input: NotificationDraft) {
  readStorage();
  const existing = items.find((item) => item.id === input.id);
  if (existing && existing.title === input.title && existing.body === input.body) return;

  const next: AppNotification = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    createdAt: existing?.createdAt ?? input.createdAt ?? new Date().toISOString(),
    read: existing?.read ?? input.read ?? false,
  };
  items = [next, ...items.filter((item) => item.id !== input.id)].slice(0, 50);
  writeStorage();
}

export function markNotificationsRead() {
  readStorage();
  if (items.length === 0 || items.every((item) => item.read)) return;
  items = items.map((item) => (item.read ? item : { ...item, read: true }));
  writeStorage();
}

export async function markNotificationsReadRemote(userId: string) {
  markNotificationsRead();
  if (!userId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);
}

const kinds = new Set<NotificationKind>(["amen", "comment", "share", "adelphoi", "system"]);

export async function notifyRecipient(input: {
  recipientId: string;
  kind: NotificationKind;
  body: string;
  href: string;
}) {
  if (!input.recipientId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;
  if (!actorId || actorId === input.recipientId) return;

  const inserted = await supabase.from("notifications").insert({
    recipient_id: input.recipientId,
    actor_id: actorId,
    kind: input.kind,
    body: input.body,
    href: input.href,
  });

  if (!inserted.error || missingRelation(inserted.error.message)) return;
}

function missingRelation(message: string) {
  return /does not exist|schema cache|could not find the table|relation/i.test(message);
}

async function namesFor(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map<string, string>();
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((profile) => [String(profile.id), profile.full_name || "Adelphoi"]));
}

export async function syncNotifications(userId: string) {
  if (!userId || !getSupabaseEnv().isConfigured) return;

  try {
    const supabase = createClient();
    const stored = await supabase
      .from("notifications")
      .select("id, actor_id, kind, body, href, created_at, read")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!stored.error) {
      const names = await namesFor((stored.data ?? []).map((row) => String(row.actor_id || "")));
      for (const row of stored.data ?? []) {
        const kind = kinds.has(row.kind as NotificationKind) ? (row.kind as NotificationKind) : "system";
        recordNotification({
          id: `db-${row.id}`,
          kind,
          title: names.get(String(row.actor_id)) || "Adelphoi",
          body: String(row.body || ""),
          href: row.href || undefined,
          createdAt: row.created_at,
          read: Boolean(row.read),
        });
      }
      return;
    }

    if (!missingRelation(stored.error.message)) return;

    const postsResult = await supabase.from("posts").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(40);
    const postIds = (postsResult.data ?? []).map((post) => String(post.id));

    if (postIds.length > 0) {
      const amenTables = ["post_amens", "likes"];
      for (const table of amenTables) {
        const result = await supabase
          .from(table)
          .select("id, post_id, user_id, created_at")
          .in("post_id", postIds)
          .neq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (result.error) {
          if (missingRelation(result.error.message)) continue;
          break;
        }
        const names = await namesFor((result.data ?? []).map((row) => String(row.user_id)));
        for (const row of result.data ?? []) {
          const actorId = String(row.user_id);
          recordNotification({
            id: `amen-in-${row.post_id}-${actorId}`,
            kind: "amen",
            title: names.get(actorId) || "Adelphoi",
            body: "Amened your post.",
            href: `/post/${row.post_id}?from=notifications`,
            createdAt: row.created_at,
          });
        }
        break;
      }

      const commentTables = ["post_comments", "comments"];
      for (const table of commentTables) {
        const result = await supabase
          .from(table)
          .select("id, post_id, user_id, content, created_at")
          .in("post_id", postIds)
          .neq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (result.error) {
          if (missingRelation(result.error.message)) continue;
          break;
        }
        const names = await namesFor((result.data ?? []).map((row) => String(row.user_id)));
        for (const row of result.data ?? []) {
          const actorId = String(row.user_id);
          const text = String(row.content || "").trim();
          recordNotification({
            id: `comment-in-${row.id}`,
            kind: "comment",
            title: names.get(actorId) || "Adelphoi",
            body: text ? `Wrote a blessing: ${text.slice(0, 80)}` : "Wrote a blessing on your post.",
            href: `/post/${row.post_id}?from=notifications&comments=1`,
            createdAt: row.created_at,
          });
        }
        break;
      }
    }

    const follows = await supabase
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("following_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!follows.error) {
      const names = await namesFor((follows.data ?? []).map((row) => String(row.follower_id)));
      for (const row of follows.data ?? []) {
        const actorId = String(row.follower_id);
        recordNotification({
          id: `adelphoi-in-${actorId}`,
          kind: "adelphoi",
          title: names.get(actorId) || "Adelphoi",
          body: "Joined your Adelphoi.",
          href: `/profile/${actorId}?from=notifications`,
          createdAt: row.created_at,
        });
      }
    }
  } catch {
    /* keep the last saved notifications */
  }
}
