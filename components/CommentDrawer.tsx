"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { FeedComment, FeedPost } from "@/lib/feed/types";

type CommentDrawerProps = {
  post: FeedPost | null;
  comments: FeedComment[];
  viewerId?: string | null;
  onClose: () => void;
  onComment: (postId: string, content: string) => void;
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

  useEffect(() => {
    setDraft("");
  }, [post?.id]);

  if (!post) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || !draft.trim()) return;
    onComment(post.id, draft);
    setDraft("");
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
          {comments.length === 0 ? <p className="text-sm text-zinc-400">No comments yet.</p> : null}
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3">
              <CommentAvatar comment={comment} />
              <div className="min-w-0 flex-1">
                {comment.userId ? (
                  <Link href={`/profile/${comment.userId}`} className="text-sm font-bold text-white">
                    {comment.fullName}
                  </Link>
                ) : (
                  <p className="text-sm font-bold text-white">{comment.fullName}</p>
                )}
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-zinc-200">{comment.content}</p>
                {onDelete && viewerId && comment.userId === viewerId ? (
                  <button
                    type="button"
                    onClick={() => onDelete(comment)}
                    className="mt-1 text-xs font-semibold text-red-400"
                  >
                    Delete comment
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a blessing..."
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
