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

  const result = await supabase.from("follows").select("following_id").eq("follower_id", me);
  if (result.error) {
    console.error("Could not load follows from Supabase. Keeping saved follows.", result.error);
    publish({ me, ids: localFollowIds(me), ready: true });
    return;
  }

  const ids = new Set<string>();
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

async function followerRow(supabase: ReturnType<typeof createClient>, me: string, targetId: string) {
  const row = await supabase.from("follows").select("follower_id").eq("follower_id", me).eq("following_id", targetId).maybeSingle();
  return !row.error && Boolean(row.data);
}

export function mergeFollowerCount(rpcCount: number | null, listedCount: number | null) {
  if (rpcCount == null && listedCount == null) return null;
  return Math.max(rpcCount ?? 0, listedCount ?? 0);
}

async function followerTotal(supabase: ReturnType<typeof createClient>, targetId: string) {
  const exact = await supabase.rpc("adelphos_count", { target_id: targetId });
  const listed = await supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", targetId);
  return mergeFollowerCount(
    !exact.error && typeof exact.data === "number" ? exact.data : null,
    listed.error ? null : listed.count ?? 0
  );
}

async function saveFollow(supabase: ReturnType<typeof createClient>, me: string, targetId: string) {
  await supabase.from("profiles").upsert({ id: me, full_name: "FOBC member" }, { onConflict: "id", ignoreDuplicates: true });
  const shared = await supabase.rpc("follow_adelphos", { target_id: targetId });
  let saved = await followerRow(supabase, me, targetId);
  if (!saved && !shared.error && typeof shared.data === "number" && shared.data > 0) {
    const total = await followerTotal(supabase, targetId);
    return { ok: true, count: total ?? shared.data, warning: null };
  }
  if (!saved) {
    const inserted = await supabase.from("follows").insert({ follower_id: me, following_id: targetId });
    const duplicate = Boolean(inserted.error && /duplicate key|unique constraint|23505/i.test(inserted.error.message));
    if (inserted.error && !duplicate) {
      return { ok: false, count: null, warning: logFollowError("upsert", inserted.error) };
    }
    saved = duplicate || (await followerRow(supabase, me, targetId));
  }
  if (!saved) {
    const detail = shared.error ? logFollowError("upsert", shared.error) : "Follow did not save. Try again.";
    return { ok: false, count: null, warning: detail };
  }
  return { ok: true, count: await followerTotal(supabase, targetId), warning: null };
}

async function removeFollow(supabase: ReturnType<typeof createClient>, me: string, targetId: string) {
  const shared = await supabase.rpc("unfollow_adelphos", { target_id: targetId });
  let gone = !(await followerRow(supabase, me, targetId));
  if (!gone) {
    const removed = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
    if (removed.error) return { ok: false, count: null, warning: logFollowError("delete", removed.error) };
    gone = !(await followerRow(supabase, me, targetId));
  }
  if (!gone) {
    const detail = shared.error ? logFollowError("delete", shared.error) : "Could not update follow. Try again.";
    return { ok: false, count: null, warning: detail };
  }
  return { ok: true, count: await followerTotal(supabase, targetId), warning: null };
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
      const removed = await removeFollow(supabase, me, targetId);
      if (!removed.ok) return { status: null, warning: removed.warning };
      next.delete(targetId);
      publish({ me, ids: next, ready: true });
      if (typeof removed.count === "number") announceAdelphoi(targetId, removed.count);
      return { status: "unfollowed", warning: null };
    }

    const saved = await saveFollow(supabase, me, targetId);
    if (!saved.ok) return { status: null, warning: saved.warning };
    next.add(targetId);
    publish({ me, ids: next, ready: true });
    if (typeof saved.count === "number") announceAdelphoi(targetId, saved.count);
    try {
      await notifyFollow(targetId);
    } catch (notifyError) {
      console.error("Follow saved, but the notification could not be sent:", notifyError);
    }
    return { status: "followed", warning: null };
  } catch (error) {
    console.error("Follow action failed:", error);
    return { status: null, warning: "Could not update follow. Try again." };
  }
}
