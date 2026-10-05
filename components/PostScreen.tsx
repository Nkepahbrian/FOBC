"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FeedCard } from "@/components/FeedCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import {
  addComment,
  deleteComment,
  deletePost,
  loadComments,
  loadPost,
  optimisticAmen,
  optimisticPrayer,
  persistAmen,
  persistPrayer,
  reportPost,
  updatePostContent,
} from "@/lib/feed/api";
import type { FeedComment, FeedPost } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";

export function PostScreen({ postId }: { postId: string }) {
  const router = useRouter();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [missing, setMissing] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("You");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [fromNotifications, setFromNotifications] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromNotes = params.get("from") === "notifications";
    setFromNotifications(fromNotes);
    if (params.get("comments") === "1") {
      setCommentsOpen(true);
      loadComments(postId).then(setComments);
    }
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      const id = data.user?.id ?? null;
      setViewerId(id);
      if (!id) return;
      const profile = await supabase.from("profiles").select("full_name, avatar_url").eq("id", id).maybeSingle();
      if (cancelled) return;
      setViewerName(profile.data?.full_name || "You");
      setViewerAvatar(profile.data?.avatar_url ?? null);
    });
    loadPost(postId).then((next) => {
      if (cancelled) return;
      if (!next) setMissing(true);
      else setPost(next);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function onAmen(id: string) {
    if (!post || post.id !== id) return;
    const next = optimisticAmen(post);
    setPost(next);
    const saved = await persistAmen(post);
    if (!saved) setPost(post);
  }

  async function onPray(id: string) {
    if (!post || post.id !== id) return;
    const next = optimisticPrayer(post);
    setPost(next);
    const saved = await persistPrayer(post);
    if (!saved) setPost(post);
  }

  async function onToggleComments(id: string) {
    setCommentsOpen((open) => !open);
    if (comments.length > 0) return;
    setComments(await loadComments(id));
  }

  async function onComment(id: string, content: string) {
    const pending: FeedComment = {
      id: `local-${Date.now()}`,
      postId: id,
      userId: viewerId,
      fullName: viewerName,
      avatarUrl: viewerAvatar,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments((current) => [...current, pending]);
    setPost((current) => (current ? { ...current, commentCount: current.commentCount + 1 } : current));
    const saved = await addComment(id, content);
    if (!saved) {
      setComments((current) => current.filter((item) => item.id !== pending.id));
      setPost((current) => (current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current));
      return;
    }
    setComments((current) => current.map((item) => (item.id === pending.id ? saved : item)));
  }

  async function onDeleteComment(comment: FeedComment) {
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setPost((current) => (current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current));
    const message = await deleteComment(comment);
    if (message) {
      setComments((current) => [...current, comment]);
      setPost((current) => (current ? { ...current, commentCount: current.commentCount + 1 } : current));
    }
  }

  const backLink = fromNotifications ? (
    <Link href="/notifications" className="mb-3 inline-flex px-4 pt-4 text-sm font-semibold text-[#EAB308]">
      Back
    </Link>
  ) : null;

  if (missing) {
    return (
      <div>
        {backLink}
        <p className="px-4 pt-8 text-sm text-zinc-400">This post is no longer available.</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div>
        {backLink}
        <div className="mx-4 mt-6 aspect-[4/5] animate-pulse rounded-2xl bg-[#121212]" />
      </div>
    );
  }

  return (
    <div className="pt-2">
      {backLink}
      <FeedCard
        post={post}
        viewerId={viewerId}
        commentsOpen={commentsOpen}
        onToggleComments={onToggleComments}
        onAmen={onAmen}
        onPray={onPray}
        onSaveEdit={async (id, content) => {
          const message = await updatePostContent(post, content);
          if (message) return message;
          setPost({ ...post, content: content.trim() });
          return null;
        }}
        onDelete={async (id) => {
          const message = await deletePost(id);
          if (message) return message;
          router.push("/profile");
          return null;
        }}
        onHide={() => router.push("/profile")}
        onReport={reportPost}
      />
      <CommentDrawer
        post={commentsOpen ? post : null}
        comments={comments}
        viewerId={viewerId}
        onClose={() => setCommentsOpen(false)}
        onComment={onComment}
        onDelete={onDeleteComment}
      />
    </div>
  );
}
