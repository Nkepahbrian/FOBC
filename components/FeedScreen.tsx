"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FeedCard } from "@/components/FeedCard";
import { LiveEventBanner } from "@/components/LiveEventBanner";
import { PrayerWall } from "@/components/PrayerWall";
import { addComment, loadComments, loadCommunity, toggleAmen, togglePrayer, type CommunitySnapshot } from "@/lib/feed/api";
import type { FeedComment } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export function FeedScreen({ initialTab = "feed" }: { initialTab?: "feed" | "prayer" }) {
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null);
  const [tab, setTab] = useState<"feed" | "prayer">(initialTab);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadCommunity();
    setSnapshot(next);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (snapshot?.mode !== "live" || !getSupabaseEnv().isConfigured) return;

    const supabase = createClient();
    const channel = supabase
      .channel("fobc-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prayers" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, snapshot?.mode]);

  function replacePost(postId: string, next: CommunitySnapshot["posts"][number]) {
    setSnapshot((current) =>
      current
        ? { ...current, posts: current.posts.map((post) => (post.id === postId ? next : post)) }
        : current
    );
  }

  async function onAmen(postId: string) {
    const post = snapshot?.posts.find((item) => item.id === postId);
    if (!post) return;
    replacePost(postId, await toggleAmen(post));
  }

  async function onPray(postId: string) {
    const post = snapshot?.posts.find((item) => item.id === postId);
    if (!post) return;
    replacePost(postId, await togglePrayer(post));
  }

  async function onToggleComments(postId: string) {
    setOpenComments((current) => (current === postId ? null : postId));
    if (commentsByPost[postId]) return;
    const comments = await loadComments(postId);
    setCommentsByPost((current) => ({ ...current, [postId]: comments }));
  }

  async function onComment(postId: string, content: string) {
    const comment = await addComment(postId, content);
    if (!comment) return;
    setCommentsByPost((current) => ({
      ...current,
      [postId]: [...(current[postId] ?? []), comment],
    }));
    setSnapshot((current) =>
      current
        ? {
            ...current,
            posts: current.posts.map((post) =>
              post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post
            ),
          }
        : current
    );
  }

  return (
    <div className="-mx-5 -mt-8">
      <LiveEventBanner events={snapshot?.events ?? []} />
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">Community</p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A]">Feed</h1>
          </div>
          <Link href="/create" className="text-sm font-semibold text-[#B45309]">
            New post
          </Link>
        </div>

        <div className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
          {(
            [
              ["feed", "Blessings"],
              ["prayer", "Prayer Wall"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "h-10 rounded-full text-sm font-semibold",
                tab === value ? "bg-[#0F172A] text-white" : "text-slate-500"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {snapshot?.notice ? (
          <p className="rounded-2xl bg-[#F59E0B]/15 px-4 py-3 text-sm text-[#92400E]">{snapshot.notice}</p>
        ) : null}

        {!snapshot ? <p className="text-sm text-slate-500">Loading blessings...</p> : null}

        {snapshot && tab === "feed" ? (
          <div className="space-y-4">
            {snapshot.posts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index, 4) * 0.04 }}
              >
                <FeedCard
                  post={post}
                  comments={commentsByPost[post.id] ?? []}
                  commentsOpen={openComments === post.id}
                  onToggleComments={onToggleComments}
                  onAmen={onAmen}
                  onPray={onPray}
                  onComment={onComment}
                />
              </motion.div>
            ))}
          </div>
        ) : null}

        {snapshot && tab === "prayer" ? (
          <PrayerWall
            posts={snapshot.posts}
            commentsByPost={commentsByPost}
            openComments={openComments}
            onToggleComments={onToggleComments}
            onAmen={onAmen}
            onPray={onPray}
            onComment={onComment}
          />
        ) : null}
      </div>
    </div>
  );
}
