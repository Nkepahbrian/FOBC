"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Grid3X3, Clapperboard, UserSquare2 } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { readPackedAudio } from "@/lib/feed/api";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ProfilePost = {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  tags: string[];
  songTitle: string | null;
};

type ProfileModel = {
  id: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  website: string | null;
  instagram: string | null;
  posts: number;
  amens: number;
  followers: number;
  grid: ProfilePost[];
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileScreen({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const [profile, setProfile] = useState<ProfileModel | null>(null);
  const [tab, setTab] = useState<"grid" | "reels" | "tagged">("grid");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      const row = (data ?? {}) as Record<string, string | null>;
      const name = row.full_name || (isOwn ? "Your profile" : "Community member");

      const postAttempts = [
        "id, content, media_url, media_type, tags, song_title, created_at",
        "id, content, created_at",
        "id, caption, created_at",
      ];
      let posts: Record<string, unknown>[] = [];
      for (const columns of postAttempts) {
        const result = await supabase.from("posts").select(columns).eq("user_id", userId).order("created_at", { ascending: false });
        if (!result.error) {
          posts = (result.data ?? []) as unknown as Record<string, unknown>[];
          break;
        }
      }

      const ids = posts.map((post) => String(post.id));
      let amens = 0;
      if (ids.length > 0) {
        const amenTables = ["post_amens", "likes"];
        for (const table of amenTables) {
          const result = await supabase.from(table).select("id").in("post_id", ids);
          if (!result.error) {
            amens = result.data?.length ?? 0;
            break;
          }
        }
      }

      let followers = 0;
      const followResult = await supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId);
      if (!followResult.error) followers = followResult.count ?? 0;

      if (cancelled) return;
      setProfile({
        id: userId,
        fullName: name,
        bio: row.bio || (isOwn ? "Add a short bio so the community knows your story." : "FOBC member"),
        avatarUrl: row.avatar_url,
        website: row.website,
        instagram: row.instagram,
        posts: posts.length,
        amens,
        followers,
        grid: posts.map((post) => {
          const packed = readPackedAudio(String(post.content || post.caption || ""));
          return {
            id: String(post.id),
            content: packed.content,
            mediaUrl: (post.media_url as string | null) ?? null,
            mediaType: (post.media_type as string | null) ?? null,
            tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
            songTitle: (post.song_title as string | null) ?? packed.songTitle,
          };
        }),
      });
    }

    load().catch(() => {
      if (!cancelled) setNotice("This profile could not be loaded.");
    });

    return () => {
      cancelled = true;
    };
  }, [isOwn, userId]);

  const highlights = useMemo(() => {
    const tags = Array.from(new Set(profile?.grid.flatMap((post) => post.tags) ?? []));
    return (tags.length > 0 ? tags : ["Faith", "Worship", "Prayer", "Family"]).slice(0, 8);
  }, [profile]);

  const visible = useMemo(() => {
    const grid = profile?.grid ?? [];
    if (tab === "reels") return grid.filter((post) => post.mediaType?.startsWith("video") || post.songTitle);
    if (tab === "tagged") return [];
    return grid;
  }, [profile, tab]);

  async function shareProfile() {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.fullName, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    setNotice("Profile link copied.");
  }

  if (!profile) {
    return <p className="px-4 pt-8 text-sm text-zinc-400">{notice || "Loading profile..."}</p>;
  }

  return (
    <section className="px-4 pt-4 text-white">
      <Wordmark className="text-3xl" />
      <div className="flex items-center gap-6">
        <div className="rounded-full bg-gradient-to-tr from-[#EAB308] via-[#FDE68A] to-[#EAB308] p-[3px]">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full border-2 border-black object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-black bg-[#121212] text-xl font-semibold text-[#EAB308]">
              {initials(profile.fullName) || "F"}
            </span>
          )}
        </div>
        <dl className="grid flex-1 grid-cols-3 text-center">
          <div>
            <dt className="text-lg font-semibold">{profile.posts}</dt>
            <dd className="text-xs text-zinc-400">Posts</dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">{profile.amens}</dt>
            <dd className="text-xs text-zinc-400">Amens</dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">{profile.followers}</dt>
            <dd className="text-xs text-zinc-400">Followers</dd>
          </div>
        </dl>
      </div>

      <h1 className="mt-4 text-sm font-semibold">{profile.fullName}</h1>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-zinc-300">{profile.bio}</p>
      <div className="mt-2 flex flex-col gap-1 text-sm font-semibold text-[#EAB308]">
        {profile.website ? (
          <a href={profile.website} target="_blank" rel="noopener noreferrer">
            {profile.website.replace(/^https?:\/\//, "")}
          </a>
        ) : null}
        {profile.instagram ? <p>@{profile.instagram.replace(/^@/, "")}</p> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {isOwn ? (
          <Link href="/onboarding" className="flex h-9 items-center justify-center rounded-lg bg-[#121212] text-sm font-semibold">
            Edit profile
          </Link>
        ) : (
          <Link href={`/chat?with=${profile.id}`} className="flex h-9 items-center justify-center rounded-lg bg-[#EAB308] text-sm font-semibold text-black">
            Message
          </Link>
        )}
        <button type="button" onClick={shareProfile} className="h-9 rounded-lg bg-[#121212] text-sm font-semibold">
          Share profile
        </button>
      </div>
      {notice ? <p className="mt-2 text-xs text-[#EAB308]">{notice}</p> : null}

      <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
        {highlights.map((item) => (
          <div key={item} className="w-16 shrink-0 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-[#121212] text-xs font-semibold text-[#EAB308]">
              {item.slice(0, 2).toUpperCase()}
            </div>
            <p className="mt-1 truncate text-[11px] text-zinc-400">{item}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 border-t border-white/10">
        {(
          [
            ["grid", Grid3X3, "Posts"],
            ["reels", Clapperboard, "Reels"],
            ["tagged", UserSquare2, "Tagged"],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            aria-label={label}
            onClick={() => setTab(value)}
            className={cn("flex h-11 items-center justify-center border-t-2", tab === value ? "border-[#EAB308] text-white" : "border-transparent text-zinc-500")}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {tab === "tagged" ? (
        <p className="py-10 text-center text-sm text-zinc-400">No tagged posts yet.</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">Nothing in this tab yet.</p>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5">
          {visible.map((post) => (
            <Link key={post.id} href={`/feed?post=${post.id}`} className="aspect-square bg-[#121212]">
              {post.mediaUrl && !post.mediaType?.startsWith("video") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-end p-2 text-left text-[11px] leading-4 text-zinc-300">
                  {post.songTitle || post.content.slice(0, 80) || "Blessing"}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
