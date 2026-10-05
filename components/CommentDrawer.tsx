"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { toggleCommentAmen } from "@/lib/feed/api";
import type { FeedComment, FeedPost } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

type CommentDrawerProps = {
  post: FeedPost | null;
  comments: FeedComment[];
  viewerId?: string | null;
  onClose: () => void;
  onComment: (postId: string, content: string, parentId?: string | null) => void;
  onDelete?: (comment: FeedComment) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CommentAvatar({ comment }: { comment: FeedComment }) {
  const face = comment.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={comment.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-[#EAB308]">
      {initials(comment.fullName) || "A"}
    </span>
  );

  if (!comment.userId) return face;
  return (
    <Link href={`/profile/${comment.userId}`} aria-label={comment.fullName} className="shrink-0">
      {face}
    </Link>
  );
}

export function CommentDrawer({ post, comments, viewerId, onClose, onComment, onDelete }: CommentDrawerProps) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});

  const likeKey = comments.map((comment) => `${comment.id}:${comment.amenCount}:${comment.likedByMe}`).join("|");
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  useEffect(() => {
    setDraft("");
    setReplyTo(null);
  }, [post?.id]);

  useEffect(() => {
    setLikes(
      Object.fromEntries(commentsRef.current.map((comment) => [comment.id, { count: comment.amenCount, liked: comment.likedByMe }]))
    );
  }, [likeKey]);

  if (!post) return null;

  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  function rootId(comment: FeedComment) {
    let current = comment;
    const seen = new Set<string>();
    while (current.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }
  const roots = comments.filter((comment) => rootId(comment) === comment.id);
  const repliesFor = (parent: FeedComment) => comments.filter((comment) => comment.id !== parent.id && rootId(comment) === parent.id);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || !draft.trim()) return;
    onComment(post.id, draft, replyTo?.id ?? null);
    setDraft("");
    setReplyTo(null);
  }

  function startReply(comment: FeedComment) {
    const handle = comment.fullName.split(" ")[0] || "member";
    setReplyTo(comment);
    setDraft(`Replying to @${handle} `);
  }

  async function toggleLike(comment: FeedComment) {
    const current = likes[comment.id] ?? { count: comment.amenCount, liked: comment.likedByMe };
    const liked = !current.liked;
    setLikes((previous) => ({
      ...previous,
      [comment.id]: { liked, count: Math.max(0, current.count + (liked ? 1 : -1)) },
    }));
    const saved = await toggleCommentAmen(comment.id, current.liked);
    if (!saved) {
      setLikes((previous) => ({ ...previous, [comment.id]: current }));
    }
  }

  function CommentRow({ comment }: { comment: FeedComment }) {
    const like = likes[comment.id] ?? { count: comment.amenCount, liked: comment.likedByMe };
    return (
      <div className="flex items-start gap-3">
        <CommentAvatar comment={comment} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {comment.userId ? (
                <Link href={`/profile/${comment.userId}`} className="text-sm font-bold text-white">
                  {comment.fullName}
                </Link>
              ) : (
                <p className="text-sm font-bold text-white">{comment.fullName}</p>
              )}
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-zinc-200">{comment.content}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleLike(comment)}
              aria-pressed={like.liked}
              aria-label={like.liked ? "Remove Amen" : "Amen"}
              className={cn("flex shrink-0 flex-col items-center text-[11px] font-semibold", like.liked ? "text-[#EAB308]" : "text-zinc-400")}
            >
              <Heart className={cn("h-4 w-4", like.liked && "fill-[#EAB308]")} />
              {like.count}
            </button>
          </div>
          <div className="mt-1 flex gap-3">
            <button type="button" onClick={() => startReply(comment)} className="text-xs font-semibold text-[#EAB308]">
              Reply
            </button>
            {onDelete && viewerId && comment.userId === viewerId ? (
              <button type="button" onClick={() => onDelete(comment)} className="text-xs font-semibold text-red-400">
                Delete comment
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        className="flex max-h-[78dvh] w-full max-w-lg flex-col rounded-t-[2rem] bg-[#121212] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#EAB308]">Comments</p>
            <h2 className="text-lg font-semibold text-white">{post.fullName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 max-h-[360px] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {roots.length === 0 ? <p className="text-sm text-zinc-400">No comments yet.</p> : null}
          {roots.map((comment) => {
            const replies = repliesFor(comment);
            return (
              <div key={comment.id}>
                <CommentRow comment={comment} />
                {replies.length > 0 ? (
                  <div className="ml-11 mt-3 space-y-3 border-l border-white/10 pl-3">
                    {replies.map((reply) => (
                      <CommentRow key={reply.id} comment={reply} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={replyTo ? `Replying to @${replyTo.fullName.split(" ")[0]}` : "Write a blessing..."}
            aria-label="Write a comment"
            className="h-11 flex-1 rounded-full border border-white/10 bg-black px-4 text-sm text-white outline-none ring-[#EAB308] focus:ring-2"
          />
          <button type="submit" className="h-11 rounded-full bg-[#EAB308] px-4 text-sm font-semibold text-black">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
