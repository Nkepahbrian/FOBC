"use client";

import { FormEvent, useState } from "react";
import { HandHeart, Heart, MessageCircle, Share2 } from "lucide-react";
import type { FeedComment, FeedPost } from "@/lib/feed/types";
import { categoryLabel, formatTimestamp } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

type FeedCardProps = {
  post: FeedPost;
  comments: FeedComment[];
  commentsOpen: boolean;
  onToggleComments: (postId: string) => void;
  onAmen: (postId: string) => void;
  onPray: (postId: string) => void;
  onComment: (postId: string, content: string) => void;
  emphasizePrayer?: boolean;
};

const badgeClass: Record<FeedPost["category"], string> = {
  testimony: "bg-[#F59E0B]/15 text-[#B45309]",
  prayer_request: "bg-[#0F172A] text-white",
  sermon_note: "bg-slate-100 text-[#0F172A]",
  general: "bg-slate-100 text-slate-600",
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function FeedCard({
  post,
  comments,
  commentsOpen,
  onToggleComments,
  onAmen,
  onPray,
  onComment,
  emphasizePrayer = false,
}: FeedCardProps) {
  const [draft, setDraft] = useState("");

  async function share() {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    const text = `${post.fullName} on FOBC: ${post.content}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "FOBC", text, url });
        return;
      } catch {
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    onComment(post.id, draft);
    setDraft("");
  }

  return (
    <article id={`post-${post.id}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3">
        {post.avatarUrl ? (
          // Supabase storage URLs are not registered with next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-[#FBBF24]">
            {initials(post.fullName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-[#0F172A]">{post.fullName}</p>
            <time className="shrink-0 text-xs text-slate-500" dateTime={post.createdAt}>
              {formatTimestamp(post.createdAt)}
            </time>
          </div>
          <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", badgeClass[post.category])}>
            {categoryLabel(post.category)}
          </span>
        </div>
      </header>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{post.content}</p>

      {post.mediaUrl && post.mediaType === "video" ? (
        <video src={post.mediaUrl} controls playsInline className="mt-3 max-h-80 w-full rounded-2xl bg-[#0F172A]" />
      ) : null}
      {post.mediaUrl && post.mediaType !== "video" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.mediaUrl} alt="" className="mt-3 max-h-80 w-full rounded-2xl object-cover" />
      ) : null}

      {post.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              #{tag}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onAmen(post.id)}
          aria-pressed={post.likedByMe}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold",
            post.likedByMe ? "bg-[#F59E0B] text-[#0F172A]" : "bg-slate-100 text-slate-600"
          )}
        >
          <Heart className={cn("h-4 w-4", post.likedByMe && "fill-current")} />
          Amen {post.amenCount}
        </button>
        <button
          type="button"
          onClick={() => onToggleComments(post.id)}
          aria-expanded={commentsOpen}
          className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-slate-100 text-sm font-semibold text-slate-600"
        >
          <MessageCircle className="h-4 w-4" />
          {post.commentCount}
        </button>
        <button
          type="button"
          onClick={share}
          className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-slate-100 text-sm font-semibold text-slate-600"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>

      {emphasizePrayer || post.category === "prayer_request" ? (
        <button
          type="button"
          onClick={() => onPray(post.id)}
          aria-pressed={post.prayedByMe}
          className={cn(
            "mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold",
            post.prayedByMe ? "bg-[#0F172A] text-[#FBBF24]" : "bg-[#F59E0B] text-[#0F172A]"
          )}
        >
          <HandHeart className="h-4 w-4" />
          {post.prayedByMe ? `Prayed · ${post.prayerCount}` : `I Prayed For This · ${post.prayerCount}`}
        </button>
      ) : null}

      {commentsOpen ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          {comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : null}
          {comments.map((comment) => (
            <p key={comment.id} className="text-sm leading-5 text-slate-700">
              <span className="font-semibold text-[#0F172A]">{comment.fullName}</span> {comment.content}
            </p>
          ))}
          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a blessing..."
              className="h-11 flex-1 rounded-full border border-slate-200 px-4 text-sm outline-none ring-[#F59E0B] focus:ring-2"
            />
            <button type="submit" className="h-11 rounded-full bg-[#0F172A] px-4 text-sm font-semibold text-white">
              Send
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
