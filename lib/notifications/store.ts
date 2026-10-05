"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type NotificationKind = "amen" | "comment" | "share" | "adelphoi" | "follow" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  is_read: boolean;
  read: boolean;
};

type NotificationDraft = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt?: string;
  is_read?: boolean;
  read?: boolean;
};

function asRead(item: { is_read?: boolean; read?: boolean }) {
  if (typeof item.is_read === "boolean") return item.is_read;
  return Boolean(item.read);
}

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
    items = Array.isArray(parsed)
      ? parsed.slice(0, 50).map((item) => {
          const is_read = asRead(item);
          return { ...item, is_read, read: is_read };
        })
      : EMPTY;
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
    syncNotifications(userId).catch((error) => console.error("Could not refresh notifications:", error));
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      syncNotifications(userId).catch((error) => console.error("Could not refresh notifications:", error));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
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
  const incomingRead = asRead(input);
  if (existing && existing.title === input.title && existing.body === input.body) {
    if (incomingRead && !existing.is_read) {
      items = items.map((item) => (item.id === input.id ? { ...item, is_read: true, read: true } : item));
      writeStorage();
    }
    return;
  }

  const is_read = existing?.is_read ? true : incomingRead;
  const next: AppNotification = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    createdAt: existing?.createdAt ?? input.createdAt ?? new Date().toISOString(),
    is_read,
    read: is_read,
  };
  items = [next, ...items.filter((item) => item.id !== input.id)].slice(0, 50);
  writeStorage();
}

export function markNotificationsRead() {
  readStorage();
  if (items.length === 0 || items.every((item) => item.is_read)) return;
  items = items.map((item) => (item.is_read ? item : { ...item, is_read: true, read: true }));
  writeStorage();
}

export async function markNotificationRead(id: string) {
  readStorage();
  const current = items.find((item) => item.id === id);
  if (!current || current.is_read) return;
  items = items.map((item) => (item.id === id ? { ...item, is_read: true, read: true } : item));
  writeStorage();

  const remoteId = id.startsWith("db-") ? id.slice(3) : "";
  if (!remoteId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  const updated = await supabase.from("notifications").update({ is_read: true, read: true }).eq("id", remoteId);
  if (!updated.error) return;
  if (/is_read/i.test(updated.error.message)) {
    const legacy = await supabase.from("notifications").update({ read: true }).eq("id", remoteId);
    if (legacy.error) console.error("Could not mark notification read:", legacy.error);
    return;
  }
  if (/read/i.test(updated.error.message)) {
    const flagged = await supabase.from("notifications").update({ is_read: true }).eq("id", remoteId);
    if (flagged.error) console.error("Could not mark notification read:", flagged.error);
    return;
  }
  console.error("Could not mark notification read:", updated.error);
}

export async function markNotificationsReadRemote(userId: string) {
  markNotificationsRead();
  if (!userId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  const updated = await supabase.from("notifications").update({ read: true, is_read: true }).eq("recipient_id", userId).eq("is_read", false);
  if (updated.error && /is_read/i.test(updated.error.message)) {
    await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);
  }
}

const kinds = new Set<NotificationKind>(["amen", "comment", "share", "adelphoi", "follow", "system"]);

export async function notifyFollow(targetUserId: string) {
  if (!targetUserId || !getSupabaseEnv().isConfigured) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;
  if (!actorId || actorId === targetUserId) return;

  const message = "started following you";
  const href = `/profile/${actorId}?from=notifications`;
  const attempts: Record<string, string | boolean>[] = [
    {
      user_id: targetUserId,
      recipient_id: targetUserId,
      actor_id: actorId,
      type: "follow",
      kind: "follow",
      message,
      body: message,
      href,
      read: false,
      is_read: false,
    },
    {
      recipient_id: targetUserId,
      actor_id: actorId,
      kind: "follow",
      body: message,
      href,
      read: false,
      is_read: false,
    },
    {
      recipient_id: targetUserId,
      actor_id: actorId,
      kind: "adelphoi",
      body: message,
      href,
      read: false,
      is_read: false,
    },
    {
      recipient_id: targetUserId,
      actor_id: actorId,
      kind: "adelphoi",
      body: message,
      href,
      read: false,
    },
  ];

  for (const payload of attempts) {
    const inserted = await supabase.from("notifications").insert(payload);
    if (!inserted.error || missingRelation(inserted.error.message)) return;
  }
  console.error("Could not save follow notification.");
}

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

  let inserted = await supabase.from("notifications").insert({
    recipient_id: input.recipientId,
    actor_id: actorId,
    kind: input.kind,
    body: input.body,
    href: input.href,
    read: false,
    is_read: false,
  });
  if (inserted.error && /is_read/i.test(inserted.error.message)) {
    inserted = await supabase.from("notifications").insert({
      recipient_id: input.recipientId,
      actor_id: actorId,
      kind: input.kind,
      body: input.body,
      href: input.href,
      read: false,
    });
  }

  if (!inserted.error || missingRelation(inserted.error.message)) return;
  console.error("Could not save notification:", inserted.error);
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
    const withFlag = await supabase
      .from("notifications")
      .select("id, actor_id, kind, body, href, created_at, read, is_read")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    const stored =
      withFlag.error && /is_read/i.test(withFlag.error.message)
        ? await supabase
            .from("notifications")
            .select("id, actor_id, kind, body, href, created_at, read")
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(40)
        : withFlag;

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
          is_read: asRead(row as { is_read?: boolean; read?: boolean }),
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
          kind: "follow",
          title: names.get(actorId) || "Adelphoi",
          body: "started following you",
          href: `/profile/${actorId}?from=notifications`,
          createdAt: row.created_at,
        });
      }
    }
  } catch {
    /* keep the last saved notifications */
  }
}
