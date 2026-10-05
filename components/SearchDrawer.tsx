"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { readPackedAudio, readPackedThought } from "@/lib/feed/api";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

type MemberHit = {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type PostHit = {
  id: string;
  userId: string;
  author: string;
  snippet: string;
};

function snippet(value: string) {
  const packed = readPackedAudio(value || "");
  const thought = readPackedThought(packed.content);
  return thought.content.replace(/\s+/g, " ").trim();
}

export function SearchDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberHit[]>([]);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const safe = query.trim().replace(/[%_,.()]/g, "");
    if (!safe) {
      setMembers([]);
      setPosts([]);
      setStatus("idle");
      return;
    }

    const timer = window.setTimeout(async () => {
      if (!getSupabaseEnv().isConfigured) {
        setStatus("error");
        return;
      }
      setStatus("loading");
      try {
        const supabase = createClient();
        const [memberResult, postResult] = await Promise.all([
          supabase.from("profiles").select("id, full_name, bio, avatar_url").ilike("full_name", `%${safe}%`).limit(12),
          supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(80),
        ]);

        if (memberResult.error && postResult.error) throw memberResult.error;
        setMembers((memberResult.data ?? []) as MemberHit[]);

        const needle = safe.toLowerCase();
        const rows = ((postResult.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
          const content = typeof row.content === "string" ? row.content : "";
          const caption = typeof row.caption === "string" ? row.caption : "";
          const raw = `${content} ${caption}`.toLowerCase();
          return raw.includes(needle) || snippet(raw).includes(needle);
        });

        const authorIds = Array.from(new Set(rows.map((row) => String(row.user_id))));
        const authors = authorIds.length
          ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
          : { data: [] };
        const names = new Map((authors.data ?? []).map((profile) => [String(profile.id), profile.full_name || "Adelphoi"]));
        setPosts(
          rows
            .map((row) => ({
              id: String(row.id),
              userId: String(row.user_id),
              author: names.get(String(row.user_id)) || "Adelphoi",
              snippet: snippet(`${typeof row.content === "string" ? row.content : ""} ${typeof row.caption === "string" ? row.caption : ""}`),
            }))
            .filter((post) => post.snippet.length > 0)
        );
        setStatus("ready");
      } catch {
        setMembers([]);
        setPosts([]);
        setStatus("error");
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [query]);

  function open(path: string) {
    onClose();
    router.push(path);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/70">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="fobc-safe-clear flex max-h-[88dvh] w-full max-w-lg flex-col rounded-b-[2rem] bg-[#0F172A] px-4 pb-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Search</h2>
          <button type="button" onClick={onClose} aria-label="Close search" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-3">
          <label className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-black px-4">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts and Adelphoi"
              aria-label="Search posts and Adelphoi"
              className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </label>
        </form>

        <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
          {status === "idle" ? <p className="text-sm text-zinc-400">Look up captions and Adelphoi members.</p> : null}
          {status === "loading" ? <p className="text-sm text-zinc-400">Searching...</p> : null}
          {status === "error" ? <p className="text-sm text-[#EAB308]">Search is unavailable right now.</p> : null}
          {status === "ready" && members.length === 0 && posts.length === 0 ? (
            <p className="text-sm text-zinc-400">No posts or Adelphoi match that search.</p>
          ) : null}

          {members.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EAB308]">Adelphoi</p>
              <ul className="mt-2 divide-y divide-white/10">
                {members.map((member) => {
                  const name = member.full_name || "Adelphoi";
                  return (
                    <li key={member.id}>
                      <button type="button" onClick={() => open(`/profile/${member.id}`)} className="flex w-full items-center gap-3 py-3 text-left">
                        <Avatar name={name} src={member.avatar_url} size="base" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{name}</span>
                          <span className="block truncate text-xs text-zinc-400">{member.bio || "FOBC Adelphoi"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {posts.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EAB308]">Posts</p>
              <ul className="mt-2 divide-y divide-white/10">
                {posts.map((post) => (
                  <li key={post.id}>
                    <button type="button" onClick={() => open(`/post/${post.id}`)} className="block w-full py-3 text-left">
                      <span className="block truncate text-sm font-semibold">{post.author}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-zinc-300">{post.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
