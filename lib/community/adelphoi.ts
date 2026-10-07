"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { notifyFollow } from "@/lib/notifications/store";
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
const FOLLOWS_KEY = "user_follows";
const ACTIVE_FOLLOW_USER = "user_follows_active";

function readFollowFile(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOLLOWS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const file: Record<string, string[]> = {};
    for (const [userId, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) file[userId] = value.map((id) => String(id)).filter(Boolean);
    }
    return file;
  } catch {
    return {};
  }
}

function localFollowIds(userId: string) {
  return new Set(readFollowFile()[userId] ?? []);
}

function writeLocalFollows(userId: string, ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    const file = readFollowFile();
    file[userId] = Array.from(new Set(ids));
    window.localStorage.setItem(FOLLOWS_KEY, JSON.stringify(file));
  } catch (error) {
    console.error("Could not save follows to localStorage:", error);
  }
}

function announceAdelphoi(userId: string, followers: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fobc-adelphoi", { detail: { userId, followers } }));
}

function publish(next: AdelphoiSnapshot) {
  snapshot = next;
  if (next.me) {
    writeLocalFollows(next.me, next.ids);
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_FOLLOW_USER, next.me);
  }
  listeners.forEach((listener) => listener());
}

function applySavedFollows() {
  if (typeof window === "undefined" || snapshot.ready) return;
  const me = window.localStorage.getItem(ACTIVE_FOLLOW_USER);
  if (!me) return;
  publish({ me, ids: localFollowIds(me), ready: true });
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

async function readFollows() {
  if (!getSupabaseEnv().isConfigured) {
    publish({ me: snapshot.me, ids: snapshot.me ? localFollowIds(snapshot.me) : new Set(), ready: true });
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

  const saved = localFollowIds(me);
  const result = await supabase.from("follows").select("following_id").eq("follower_id", me);
  if (result.error) {
    console.error("Could not load follows from Supabase. Keeping saved follows.", result.error);
    publish({ me, ids: saved, ready: true });
    return;
  }

  const ids = new Set<string>(saved);
  for (const row of result.data ?? []) ids.add(String(row.following_id));
  publish({ me, ids, ready: true });
}

export async function reloadAdelphoi() {
  if (loading) return loading;
  loading = readFollows().finally(() => {
    loading = null;
  });
  return loading;
}

export async function ensureAdelphoiLoaded() {
  if (snapshot.ready) return;
  return reloadAdelphoi();
}

export function useAdelphoi() {
  const state = useSyncExternalStore(subscribeAdelphoi, getAdelphoiSnapshot, getAdelphoiServerSnapshot);
  useLayoutEffect(() => {
    applySavedFollows();
  }, []);
  useEffect(() => {
    reloadAdelphoi().catch((error) => console.error("Could not load follow status:", error));
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
  _targetName: string,
  follow?: boolean
): Promise<{ status: "followed" | "unfollowed" | null; warning: string | null }> {
  try {
    await ensureAdelphoiLoaded();
    const { me, ids } = snapshot;
    if (!me || me === targetId || !getSupabaseEnv().isConfigured) {
      return { status: null, warning: me ? null : "Sign in to follow Adelphos." };
    }

    const supabase = createClient();
    const shouldFollow = follow ?? !ids.has(targetId);
    const next = new Set(ids);

    if (!shouldFollow) {
      next.delete(targetId);
      publish({ me, ids: next, ready: true });
      const shared = await supabase.rpc("unfollow_adelphos", { target_id: targetId });
      if (!shared.error && typeof shared.data === "number") {
        announceAdelphoi(targetId, shared.data);
        return { status: "unfollowed", warning: null };
      }
      const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
      if (error) logFollowError("delete", error);
      return { status: "unfollowed", warning: null };
    }

    next.add(targetId);
    publish({ me, ids: next, ready: true });
    const shared = await supabase.rpc("follow_adelphos", { target_id: targetId });
    if (!shared.error && typeof shared.data === "number") {
      announceAdelphoi(targetId, shared.data);
      try {
        await notifyFollow(targetId);
      } catch (notifyError) {
        console.error("Follow saved, but the notification could not be sent:", notifyError);
      }
      return { status: "followed", warning: null };
    }
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
      logFollowError("upsert", error);
      return { status: "followed", warning: null };
    }

    try {
      await notifyFollow(targetId);
    } catch (notifyError) {
      console.error("Follow saved, but the notification could not be sent:", notifyError);
    }
    return { status: "followed", warning: null };
  } catch (error) {
    console.error("Follow action failed:", error);
    const { me, ids } = snapshot;
    if (me && follow !== undefined && me !== targetId) {
      const next = new Set(ids);
      if (follow) next.add(targetId);
      else next.delete(targetId);
      publish({ me, ids: next, ready: true });
      return { status: follow ? "followed" : "unfollowed", warning: null };
    }
    return { status: null, warning: "Could not update follow. Try again." };
  }
}
