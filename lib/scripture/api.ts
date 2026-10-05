import { createClient } from "@/lib/supabase/client";

export type ScriptureNote = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  content: string;
  style: string;
  updatedAt?: string;
};

const localKey = "fobc-scripture";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isCurrent(updatedAt?: string | null) {
  if (!updatedAt) return true;
  const time = new Date(updatedAt).getTime();
  if (Number.isNaN(time)) return true;
  return Date.now() - time < WEEK_MS;
}

function missing(message: string) {
  return /does not exist|schema cache|could not find|column/i.test(message);
}

function readLocal(userId: string): ScriptureNote | null {
  try {
    const raw = window.localStorage.getItem(localKey);
    if (!raw) return null;
    const note = JSON.parse(raw) as ScriptureNote;
    if (note.userId !== userId) return null;
    if (!note.updatedAt) {
      note.updatedAt = new Date().toISOString();
      writeLocal(note);
      return note;
    }
    return isCurrent(note.updatedAt) ? note : null;
  } catch {
    return null;
  }
}

function writeLocal(note: ScriptureNote) {
  window.localStorage.setItem(localKey, JSON.stringify(note));
}

export async function loadScriptures(userId: string, fullName: string, avatarUrl: string | null) {
  const supabase = createClient();
  const following = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  const ids = Array.from(new Set([userId, ...((following.data ?? []).map((row) => row.following_id as string))]));
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const people = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

  const notes = await supabase.from("scripture_notes").select("user_id, content, style, updated_at").in("user_id", ids);
  const rows: ScriptureNote[] = !notes.error
    ? (notes.data ?? [])
        .filter((row) => isCurrent((row.updated_at as string | null) ?? null))
        .map((row) => {
          const person = people.get(row.user_id as string);
          return {
            userId: row.user_id as string,
            fullName: (person?.full_name as string | null) || (row.user_id === userId ? fullName : "Community member"),
            avatarUrl: (person?.avatar_url as string | null) ?? (row.user_id === userId ? avatarUrl : null),
            content: row.content as string,
            style: (row.style as string) || "red",
            updatedAt: (row.updated_at as string | null) ?? undefined,
          };
        })
    : [];

  if (notes.error && missing(notes.error.message)) {
    const fallback = await supabase.from("profiles").select("id, full_name, avatar_url, scripture_text, scripture_style").in("id", ids);
    if (!fallback.error) {
      for (const profile of fallback.data ?? []) {
        const text = (profile.scripture_text as string | null)?.trim();
        if (!text) continue;
        rows.push({
          userId: profile.id as string,
          fullName: (profile.full_name as string | null) || "Community member",
          avatarUrl: (profile.avatar_url as string | null) ?? null,
          content: text,
          style: (profile.scripture_style as string) || "red",
        });
      }
    }
  }

  const local = readLocal(userId);
  if (local && !rows.some((note) => note.userId === userId)) rows.unshift(local);
  return rows.sort((left, right) => Number(right.userId === userId) - Number(left.userId === userId));
}

export async function saveScripture(note: ScriptureNote) {
  const stamped = { ...note, updatedAt: new Date().toISOString() };
  writeLocal(stamped);
  const supabase = createClient();
  const saved = await supabase.from("scripture_notes").upsert({
    user_id: stamped.userId,
    content: stamped.content,
    style: stamped.style,
    updated_at: stamped.updatedAt,
  });
  if (!saved.error) return null;

  if (missing(saved.error.message)) {
    const profile = await supabase
      .from("profiles")
      .update({ scripture_text: note.content, scripture_style: note.style })
      .eq("id", note.userId);
    if (!profile.error) return null;
  }

  return "Your scripture is saved on this device. Run supabase/phase11.sql so the community can read it.";
}
