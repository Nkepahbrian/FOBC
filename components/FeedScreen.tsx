"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FeedCard } from "@/components/FeedCard";
import { FeedHeader } from "@/components/FeedHeader";
import { CommentDrawer } from "@/components/CommentDrawer";
import { LiveEventBanner } from "@/components/LiveEventBanner";
import { PrayerWall } from "@/components/PrayerWall";
import {
  addComment,
  loadComments,
  loadCommunity,
  optimisticAmen,
  optimisticPrayer,
  persistAmen,
  persistPrayer,
  type CommunitySnapshot,
} from "@/lib/feed/api";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "post_amens" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prayers" }, () => {
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
    replacePost(postId, optimisticAmen(post));
    const saved = await persistAmen(post);
    if (!saved) replacePost(postId, post);
  }

  async function onPray(postId: string) {
    const post = snapshot?.posts.find((item) => item.id === postId);
    if (!post) return;
    replacePost(postId, optimisticPrayer(post));
    const saved = await persistPrayer(post);
    if (!saved) replacePost(postId, post);
  }

  async function onToggleComments(postId: string) {
    setOpenComments((current) => (current === postId ? null : postId));
    if (commentsByPost[postId]) return;
    const comments = await loadComments(postId);
    setCommentsByPost((current) => ({ ...current, [postId]: comments }));
  }

  async function onComment(postId: string, content: string) {
    const pending = {
      id: `local-${Date.now()}`,
      postId,
      fullName: "You",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setCommentsByPost((current) => ({
      ...current,
      [postId]: [...(current[postId] ?? []), pending],
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

    const comment = await addComment(postId, content);
    if (!comment) {
      setCommentsByPost((current) => ({
        ...current,
        [postId]: (current[postId] ?? []).filter((item) => item.id !== pending.id),
      }));
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((post) =>
                post.id === postId ? { ...post, commentCount: Math.max(0, post.commentCount - 1) } : post
              ),
            }
          : current
      );
      return;
    }

    setCommentsByPost((current) => ({
      ...current,
      [postId]: (current[postId] ?? []).map((item) => (item.id === pending.id ? comment : item)),
    }));
  }

  const isLiveActive = snapshot?.isLiveActive ?? false;
  const blessings = snapshot?.posts.filter((post) => post.category !== "prayer_request") ?? [];
  const openPost = snapshot?.posts.find((post) => post.id === openComments) ?? null;

  return (
    <div className="-mx-5 -mt-8">
      <FeedHeader />
      <LiveEventBanner events={snapshot?.events ?? []} isLiveActive={isLiveActive} />
      <div className="space-y-4 px-4 py-3">
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
          <div className="-mx-4 divide-y divide-slate-100">
            {blessings.length === 0 ? (
              <p className="px-4 text-sm text-slate-500">No testimonies yet. Share a blessing with the community.</p>
            ) : null}
            {blessings.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index, 4) * 0.04 }}
              >
                <FeedCard
                  post={post}
                  commentsOpen={openComments === post.id}
                  onToggleComments={onToggleComments}
                  onAmen={onAmen}
                  onPray={onPray}
                />
              </motion.div>
            ))}
          </div>
        ) : null}

        {snapshot && tab === "prayer" ? (
          <PrayerWall
            posts={snapshot.posts}
            openComments={openComments}
            onToggleComments={onToggleComments}
            onAmen={onAmen}
            onPray={onPray}
          />
        ) : null}
      </div>
      <CommentDrawer
        post={openPost}
        comments={openComments ? commentsByPost[openComments] ?? [] : []}
        onClose={() => setOpenComments(null)}
        onComment={onComment}
      />
    </div>
  );
}
