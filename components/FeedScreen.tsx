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
  deleteComment,
  deletePost,
  loadComments,
  loadCommunity,
  optimisticAmen,
  optimisticPrayer,
  persistAmen,
  persistPrayer,
  reportPost,
  updatePostContent,
  type CommunitySnapshot,
} from "@/lib/feed/api";
import type { FeedComment, FeedPost } from "@/lib/feed/types";
import { readStale, writeCache } from "@/lib/cache/swr";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

function readOptimisticPost(): FeedPost | null {
  try {
    const raw = window.sessionStorage.getItem("fobc-optimistic-post");
    return raw ? (JSON.parse(raw) as FeedPost) : null;
  } catch {
    return null;
  }
}

function FeedSkeleton() {
  return (
    <div className="px-4 py-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="mb-6 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/10" />
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-white/10" />
              <div className="h-2 w-16 rounded bg-white/10" />
            </div>
          </div>
          <div className="mt-3 aspect-[4/5] rounded-2xl bg-[#121212]" />
        </div>
      ))}
    </div>
  );
}

export function FeedScreen({ initialTab = "feed" }: { initialTab?: "feed" | "prayer" }) {
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null);
  const [booting, setBooting] = useState(true);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("You");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    let next = await loadCommunity();
    const sharedId = window.sessionStorage.getItem("fobc-just-shared");
    if (sharedId) {
      if (sharedId !== "latest" && !next.posts.some((post) => post.id === sharedId)) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        next = await loadCommunity();
      }
      const index =
        sharedId === "latest"
          ? next.posts.reduce((best, post, postIndex, all) => {
              if (best < 0) return postIndex;
              return new Date(post.createdAt).getTime() > new Date(all[best].createdAt).getTime() ? postIndex : best;
            }, -1)
          : next.posts.findIndex((post) => post.id === sharedId);
      if (index > 0) {
        const posts = [...next.posts];
        const [post] = posts.splice(index, 1);
        next = { ...next, posts: [post, ...posts] };
      }
      window.sessionStorage.removeItem("fobc-just-shared");
    }
    const optimistic = readOptimisticPost();
    if (optimistic) {
      const saved = next.posts.some((post) => post.id === optimistic.id || (post.userId === optimistic.userId && post.content === optimistic.content && !post.id.startsWith("local-")));
      if (saved) window.sessionStorage.removeItem("fobc-optimistic-post");
      else next = { ...next, posts: [optimistic, ...next.posts.filter((post) => post.id !== optimistic.id)] };
    }
    next = {
      ...next,
      posts: [...next.posts].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    };
    setSnapshot(next);
  }, []);

  useEffect(() => {
    const cached = readStale<CommunitySnapshot>("fobc-feed");
    const optimistic = readOptimisticPost();
    if (cached) {
      setSnapshot(optimistic ? { ...cached, posts: [optimistic, ...cached.posts.filter((post) => post.id !== optimistic.id)] } : cached);
      setBooting(false);
    } else if (optimistic) {
      setSnapshot({ posts: [optimistic], events: [], isLiveActive: false, mode: "live", notice: null });
    }
    refresh().finally(() => setBooting(false));
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id ?? null;
      setViewerId(id);
      if (!id) return;
      const profile = await supabase.from("profiles").select("full_name, avatar_url").eq("id", id).maybeSingle();
      setViewerName(profile.data?.full_name || "You");
      setViewerAvatar(profile.data?.avatar_url ?? null);
    });
  }, [refresh]);

  useEffect(() => {
    function onAvatar(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; avatarUrl: string }>).detail;
      if (!detail?.userId) return;
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((post) => (post.userId === detail.userId ? { ...post, avatarUrl: detail.avatarUrl } : post)),
            }
          : current
      );
    }
    window.addEventListener("fobc-avatar", onAvatar);
    return () => window.removeEventListener("fobc-avatar", onAvatar);
  }, []);

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
    setSnapshot((current) => {
      if (!current) return current;
      const snapshot = { ...current, posts: current.posts.map((post) => (post.id === postId ? next : post)) };
      writeCache("fobc-feed", snapshot);
      return snapshot;
    });
  }

  async function onAmen(postId: string) {
    const post = snapshot?.posts.find((item) => item.id === postId);
    if (!post) return;
    const nextAmen = optimisticAmen(post);
    replacePost(postId, nextAmen);
    window.dispatchEvent(new CustomEvent("fobc-amen", { detail: nextAmen }));
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

  async function onComment(postId: string, content: string, parentId?: string | null) {
    const pending = {
      id: `local-${Date.now()}`,
      postId,
      userId: viewerId,
      fullName: viewerName,
      avatarUrl: viewerAvatar,
      content: content.trim(),
      createdAt: new Date().toISOString(),
      parentId: parentId ?? null,
      amenCount: 0,
      likedByMe: false,
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

    const comment = await addComment(postId, content, parentId);
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

  async function onDeleteComment(comment: FeedComment) {
    setCommentsByPost((current) => ({
      ...current,
      [comment.postId]: (current[comment.postId] ?? []).filter((item) => item.id !== comment.id),
    }));
    setSnapshot((current) =>
      current
        ? {
            ...current,
            posts: current.posts.map((post) =>
              post.id === comment.postId ? { ...post, commentCount: Math.max(0, post.commentCount - 1) } : post
            ),
          }
        : current
    );
    const message = await deleteComment(comment);
    if (message) {
      setCommentsByPost((current) => ({
        ...current,
        [comment.postId]: [...(current[comment.postId] ?? []), comment],
      }));
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((post) =>
                post.id === comment.postId ? { ...post, commentCount: post.commentCount + 1 } : post
              ),
            }
          : current
      );
    }
  }

  const isLiveActive = snapshot?.isLiveActive ?? false;
  async function onSaveEdit(postId: string, content: string) {
    const post = snapshot?.posts.find((item) => item.id === postId);
    if (!post) return "This post is no longer on the feed.";
    const message = await updatePostContent(post, content);
    if (message) return message;
    replacePost(postId, { ...post, content: content.trim() });
    return null;
  }

  async function onDelete(postId: string) {
    const message = await deletePost(postId);
    if (message) return message;
    setSnapshot((current) =>
      current ? { ...current, posts: current.posts.filter((post) => post.id !== postId) } : current
    );
    return null;
  }

  function onHide(postId: string) {
    setHiddenIds((current) => (current.includes(postId) ? current : [...current, postId]));
  }

  async function onReport(postId: string) {
    return reportPost(postId);
  }

  const visiblePosts = (snapshot?.posts ?? []).filter((post) => !hiddenIds.includes(post.id));
  const openPost = snapshot?.posts.find((post) => post.id === openComments) ?? null;

  return (
    <div>
      <FeedHeader />
      <LiveEventBanner events={snapshot?.events ?? []} isLiveActive={isLiveActive} />
      <div className="py-2">
        {snapshot?.notice ? (
          <p className="mx-4 rounded-2xl bg-[#EAB308]/15 px-4 py-3 text-sm text-[#EAB308]">{snapshot.notice}</p>
        ) : null}

        {booting && !snapshot ? <FeedSkeleton /> : null}

        {snapshot && initialTab === "prayer" ? (
          <PrayerWall
            posts={visiblePosts}
            viewerId={viewerId}
            openComments={openComments}
            onToggleComments={onToggleComments}
            onAmen={onAmen}
            onPray={onPray}
            onSaveEdit={onSaveEdit}
            onDelete={onDelete}
            onHide={onHide}
            onReport={onReport}
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
                  viewerId={viewerId}
                  commentsOpen={openComments === post.id}
                  onToggleComments={onToggleComments}
                  onAmen={onAmen}
                  onPray={onPray}
                  onSaveEdit={onSaveEdit}
                  onDelete={onDelete}
                  onHide={onHide}
                  onReport={onReport}
                />
              </motion.div>
            ))}
          </div>
        ) : null}
      </div>
      <CommentDrawer
        post={openPost}
        comments={openComments ? commentsByPost[openComments] ?? [] : []}
        viewerId={viewerId}
        onClose={() => setOpenComments(null)}
        onComment={onComment}
        onDelete={onDeleteComment}
      />
    </div>
  );
}
