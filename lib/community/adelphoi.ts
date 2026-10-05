"use client";

import { useEffect, useSyncExternalStore } from "react";
import { notifyRecipient } from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

type AdelphoiSnapshot = {
  me: string | null;
  ids: ReadonlySet<string>;
  ready: boolean;
};

const listeners = new Set<() => void>();
const serverSnapshot: AdelphoiSnapshot = { me: null, ids: new Set(), ready: false };
let snapshot: AdelphoiSnapshot = serverSnapshot;
let loading: Promise<void> | null = null;

function publish(next: AdelphoiSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAdelphoi(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAdelphoiSnapshot() {
  return snapshot;
}

export function getAdelphoiServerSnapshot() {
  return serverSnapshot;
}

export async function ensureAdelphoiLoaded() {
  if (snapshot.ready) return;
  if (loading) return loading;

  loading = (async () => {
    if (!getSupabaseEnv().isConfigured) {
      publish({ me: null, ids: new Set(), ready: true });
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const me = user?.id ?? null;
    if (!me) {
      publish({ me: null, ids: new Set(), ready: true });
      return;
    }

    const result = await supabase.from("follows").select("following_id").eq("follower_id", me);
    const ids = result.error ? new Set<string>() : new Set((result.data ?? []).map((row) => String(row.following_id)));
    publish({ me, ids, ready: true });
  })().finally(() => {
    loading = null;
  });

  return loading;
}

export function useAdelphoi() {
  const state = useSyncExternalStore(subscribeAdelphoi, getAdelphoiSnapshot, getAdelphoiServerSnapshot);
  useEffect(() => {
    ensureAdelphoiLoaded().catch(() => undefined);
  }, []);
  return state;
}

export async function toggleAdelphoi(targetId: string, targetName: string): Promise<"followed" | "unfollowed" | null> {
  await ensureAdelphoiLoaded();
  const { me, ids } = snapshot;
  if (!me || me === targetId || !getSupabaseEnv().isConfigured) return null;

  const supabase = createClient();
  const connected = ids.has(targetId);
  const next = new Set(ids);

  if (connected) {
    next.delete(targetId);
    publish({ me, ids: next, ready: true });
    const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
    if (error) {
      publish({ me, ids, ready: true });
      return null;
    }
    return "unfollowed";
  }

  next.add(targetId);
  publish({ me, ids: next, ready: true });
  const { error } = await supabase.from("follows").insert({ follower_id: me, following_id: targetId });
  if (error) {
    publish({ me, ids, ready: true });
    return null;
  }

  await notifyRecipient({
    recipientId: targetId,
    kind: "adelphoi",
    body: `${targetName.trim() || "Someone"} started following you.`,
    href: `/profile/${me}?from=notifications`,
  });
  return "followed";
}
