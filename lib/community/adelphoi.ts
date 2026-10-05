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

function permissionBlocked(error: { message: string; code?: string }) {
  return /row-level security|permission denied|42501|policy/i.test(`${error.code ?? ""} ${error.message}`);
}

function logFollowError(action: "upsert" | "delete", error: { message: string; code?: string }) {
  if (permissionBlocked(error)) {
    console.error(
      `Follow ${action} was blocked by Supabase row-level security on the follows table. follower_id must equal the signed-in user.`,
      error
    );
    return "Follow was blocked by a permission rule. The follows policy needs to allow your account.";
  }
  console.error(`Follow ${action} failed:`, error);
  return "Could not update follow. Try again.";
}

export async function toggleAdelphoi(
  targetId: string,
  targetName: string,
  follow?: boolean
): Promise<{ status: "followed" | "unfollowed" | null; warning: string | null }> {
  let restore: AdelphoiSnapshot | null = null;
  try {
    await ensureAdelphoiLoaded();
    const { me, ids } = snapshot;
    if (!me || me === targetId || !getSupabaseEnv().isConfigured) {
      return { status: null, warning: me ? null : "Sign in to follow Adelphos." };
    }

    const supabase = createClient();
    const shouldFollow = follow ?? !ids.has(targetId);
    const previous = new Set(ids);
    const next = new Set(ids);
    restore = { me, ids: previous, ready: true };

    if (!shouldFollow) {
      next.delete(targetId);
      publish({ me, ids: next, ready: true });
      const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
      if (error) {
        publish(restore);
        return { status: null, warning: logFollowError("delete", error) };
      }
      return { status: "unfollowed", warning: null };
    }

    next.add(targetId);
    publish({ me, ids: next, ready: true });
    let { error } = await supabase.from("follows").upsert(
      { follower_id: me, following_id: targetId },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true }
    );
    if (error && /on conflict|42P10|no unique/i.test(error.message)) {
      const inserted = await supabase.from("follows").insert({ follower_id: me, following_id: targetId });
      error = inserted.error && /duplicate key|unique constraint|23505/i.test(inserted.error.message) ? null : inserted.error;
    }
    if (error && /duplicate key|unique constraint|23505/i.test(error.message)) error = null;
    if (error) {
      publish(restore);
      return { status: null, warning: logFollowError("upsert", error) };
    }

    try {
      await notifyRecipient({
        recipientId: targetId,
        kind: "adelphoi",
        body: `${targetName.trim() || "Someone"} started following you.`,
        href: `/profile/${me}?from=notifications`,
      });
    } catch (notifyError) {
      console.error("Follow saved, but the notification could not be sent:", notifyError);
    }
    return { status: "followed", warning: null };
  } catch (error) {
    console.error("Follow action failed:", error);
    if (restore) publish(restore);
    return { status: null, warning: "Could not update follow. Try again." };
  }
}
