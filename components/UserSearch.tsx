"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

type ProfileHit = {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileHit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const trimmed = query.trim().replace(/[%_]/g, "");
    if (!trimmed) {
      setResults([]);
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
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .ilike("full_name", `%${trimmed}%`)
          .limit(20);

        if (error) throw error;
        setResults((data ?? []) as ProfileHit[]);
        setStatus("ready");
      } catch {
        setResults([]);
        setStatus("error");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <section className="space-y-4 px-4 pt-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EAB308]">Community</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Search</h1>
      </div>
      <label className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-[#121212] px-4">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>

      {status === "idle" ? <p className="text-sm text-zinc-400">Search by name to find someone in the community.</p> : null}
      {status === "loading" ? <p className="text-sm text-zinc-400">Searching...</p> : null}
      {status === "error" ? (
        <p className="rounded-2xl bg-[#F59E0B]/15 px-4 py-3 text-sm text-[#92400E]">
          Search is unavailable right now. You can still browse the feed.
        </p>
      ) : null}
      {status === "ready" && results.length === 0 ? (
        <p className="text-sm text-zinc-400">No one matches that name yet.</p>
      ) : null}

      <ul className="divide-y divide-white/10">
        {results.map((profile) => {
          const name = profile.full_name || "Community member";
          return (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => router.push(`/profile/${profile.id}`)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-[#FBBF24]">
                    {initials(name)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{name}</span>
                  <span className="block truncate text-sm text-zinc-400">{profile.bio || "Member of FOBC"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Link href="/feed" className="inline-block text-sm font-semibold text-[#EAB308]">
        Back to feed
      </Link>
    </section>
  );
}
