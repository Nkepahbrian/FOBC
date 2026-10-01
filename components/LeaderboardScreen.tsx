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
    .sort((left, right) => right.amenCount - left.amenCount || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function isAudioUrl(url: string) {
  return /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function winnerMedia(post: FeedPost) {
  const urls = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : post.mediaUrl ? [post.mediaUrl] : [];
  const url = urls.find((item) => item && !isAudioUrl(item));
  if (!url) return null;
  return {
    url,
    video: post.mediaType === "video" || isVideoUrl(url),
  };
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

  const winner = posts?.[0] ?? null;
  const media = winner ? winnerMedia(winner) : null;

  return (
    <section className="px-4 pt-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EAB308]">Day 1–3</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">During the FOB, the post with the highest-amen (likes) stays here.</p>
      {!posts ? (
        <div className="mt-6 h-80 animate-pulse rounded-2xl bg-[#121212]" />
      ) : !winner ? (
        <p className="mt-6 text-sm text-zinc-400">No blessings yet. The first Amen will open this board.</p>
      ) : (
        <article className="mt-6 overflow-hidden rounded-2xl bg-[#121212] ring-1 ring-[#EAB308]">
          {media?.video ? (
            <video
              src={`${media.url}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              loop
              onLoadedMetadata={(event) => {
                if (event.currentTarget.currentTime < 0.1) event.currentTarget.currentTime = 0.1;
              }}
              className="aspect-[4/5] w-full bg-black object-cover"
              style={{ objectFit: "cover" }}
            />
          ) : media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" style={{ objectFit: "cover" }} />
          ) : null}
          <div className="p-4">
            <p className="text-xs font-semibold text-[#EAB308]">#1</p>
            <p className="mt-1 truncate text-sm font-semibold">{winner.fullName}</p>
            {winner.location ? <p className="truncate text-xs text-zinc-400">{winner.location}</p> : null}
            {winner.songTitle ? (
              <p className="truncate text-xs text-white">
                {winner.songArtist || "FOBC"} • {winner.songTitle}
              </p>
            ) : null}
            {winner.content ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-200">{winner.content}</p> : null}
            <button
              type="button"
              onClick={() => onAmen(winner)}
              aria-pressed={winner.likedByMe}
              className={cn("mt-3 flex items-center gap-1.5 text-sm font-semibold", winner.likedByMe ? "text-[#EAB308]" : "text-white")}
            >
              <Heart className={cn("h-4 w-4", winner.likedByMe && "fill-[#EAB308]")} />
              {winner.amenCount} Amen{winner.amenCount === 1 ? "" : "s"}
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
