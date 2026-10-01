"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { readStale, writeCache } from "@/lib/cache/swr";
import { loadLeaderboard, optimisticAmen, persistAmen } from "@/lib/feed/api";
import type { FeedPost } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function sortBoard(posts: FeedPost[]) {
  return posts
    .slice()
    .sort((left, right) => right.amenCount - left.amenCount || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 10);
}

export function LeaderboardScreen() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  const refresh = useCallback(async () => {
    const next = sortBoard(await loadLeaderboard());
    setPosts(next);
    writeCache("fobc-leaderboard", next);
  }, []);

  useEffect(() => {
    const cached = readStale<FeedPost[]>("fobc-leaderboard");
    if (cached) setPosts(sortBoard(cached));
    refresh();
    const supabase = createClient();
    const channel = supabase
      .channel("fobc-leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_amens" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => {
        refresh();
      })
      .subscribe();
    function onAmen(event: Event) {
      const post = (event as CustomEvent<FeedPost>).detail;
      if (!post?.id) return;
      setPosts((current) => sortBoard((current ?? []).map((item) => (item.id === post.id ? post : item))));
    }
    window.addEventListener("fobc-amen", onAmen);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("fobc-amen", onAmen);
    };
  }, [refresh]);

  async function onAmen(post: FeedPost) {
    const next = optimisticAmen(post);
    setPosts((current) => {
      const board = sortBoard((current ?? []).map((item) => (item.id === post.id ? next : item)));
      writeCache("fobc-leaderboard", board);
      return board;
    });
    window.dispatchEvent(new CustomEvent("fobc-amen", { detail: next }));
    const saved = await persistAmen(post);
    if (!saved) {
      setPosts((current) => sortBoard((current ?? []).map((item) => (item.id === post.id ? post : item))));
    }
  }

  return (
    <section className="px-4 pt-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EAB308]">Day 1–3</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">During the FOB, the post with the highest-amen (likes) stays here.</p>
      {!posts ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#121212]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">No blessings yet. The first Amen will open this board.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {posts.map((post, index) => (
            <li key={post.id} className={cn("rounded-2xl bg-[#121212] p-4", index === 0 && "ring-1 ring-[#EAB308]")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#EAB308]">#{index + 1}</p>
                  <p className="mt-1 truncate text-sm font-semibold">{post.fullName}</p>
                  {post.location ? <p className="truncate text-xs text-zinc-400">{post.location}</p> : null}
                  {post.songTitle ? (
                    <p className="truncate text-xs text-white">
                      {post.songArtist || "FOBC"} • {post.songTitle}
                    </p>
                  ) : null}
                  <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-200">{post.content}</p>
                </div>
                {post.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onAmen(post)}
                aria-pressed={post.likedByMe}
                className={cn("mt-3 flex items-center gap-1.5 text-sm font-semibold", post.likedByMe ? "text-[#EAB308]" : "text-white")}
              >
                <Heart className={cn("h-4 w-4", post.likedByMe && "fill-[#EAB308]")} />
                {post.amenCount} Amen{post.amenCount === 1 ? "" : "s"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
