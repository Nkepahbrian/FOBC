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

export function FeedScreen({ initialTab = "feed" }: { initialTab?: "feed" | "prayer" }) {
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null);
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
  const visiblePosts =
    initialTab === "prayer"
      ? snapshot?.posts.filter((post) => post.category === "prayer_request") ?? []
      : snapshot?.posts ?? [];
  const openPost = snapshot?.posts.find((post) => post.id === openComments) ?? null;

  return (
    <div>
      <FeedHeader />
      <LiveEventBanner events={snapshot?.events ?? []} isLiveActive={isLiveActive} />
      <div className="py-2">
        {snapshot?.notice ? (
          <p className="mx-4 rounded-2xl bg-[#EAB308]/15 px-4 py-3 text-sm text-[#EAB308]">{snapshot.notice}</p>
        ) : null}

        {!snapshot ? <p className="px-4 text-sm text-zinc-500">Loading blessings...</p> : null}

        {snapshot && initialTab === "prayer" ? (
          <PrayerWall
            posts={snapshot.posts}
            openComments={openComments}
            onToggleComments={onToggleComments}
            onAmen={onAmen}
            onPray={onPray}
          />
        ) : null}

        {snapshot && initialTab !== "prayer" ? (
          <div>
            {visiblePosts.length === 0 ? (
              <p className="px-4 text-sm text-zinc-400">No blessings yet. Share the first testimony.</p>
            ) : null}
            {visiblePosts.map((post, index) => (
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
