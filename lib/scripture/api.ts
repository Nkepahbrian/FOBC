import { createClient } from "@/lib/supabase/client";

export type ScriptureNote = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  content: string;
  style: string;
};

const localKey = "fobc-scripture";

function missing(message: string) {
  return /does not exist|schema cache|could not find|column/i.test(message);
}

function readLocal(userId: string): ScriptureNote | null {
  try {
    const raw = window.localStorage.getItem(localKey);
    if (!raw) return null;
    const note = JSON.parse(raw) as ScriptureNote;
    return note.userId === userId ? note : null;
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

  const notes = await supabase.from("scripture_notes").select("user_id, content, style").in("user_id", ids);
  const rows: ScriptureNote[] = !notes.error
    ? (notes.data ?? []).map((row) => {
        const person = people.get(row.user_id as string);
        return {
          userId: row.user_id as string,
          fullName: (person?.full_name as string | null) || (row.user_id === userId ? fullName : "Community member"),
          avatarUrl: (person?.avatar_url as string | null) ?? (row.user_id === userId ? avatarUrl : null),
          content: row.content as string,
          style: (row.style as string) || "red",
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
  writeLocal(note);
  const supabase = createClient();
  const saved = await supabase.from("scripture_notes").upsert({
    user_id: note.userId,
    content: note.content,
    style: note.style,
    updated_at: new Date().toISOString(),
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
