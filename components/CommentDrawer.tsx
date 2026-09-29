"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { FeedComment, FeedPost } from "@/lib/feed/types";

type CommentDrawerProps = {
  post: FeedPost | null;
  comments: FeedComment[];
  onClose: () => void;
  onComment: (postId: string, content: string) => void;
};

export function CommentDrawer({ post, comments, onClose, onComment }: CommentDrawerProps) {
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
        className="flex max-h-[78vh] w-full max-w-md flex-col rounded-t-[2rem] bg-[#121212] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-white shadow-2xl"
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
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {comments.length === 0 ? <p className="text-sm text-zinc-400">No comments yet.</p> : null}
          {comments.map((comment) => (
            <p key={comment.id} className="text-sm leading-5 text-zinc-200">
              <span className="font-semibold text-white">{comment.fullName}</span> {comment.content}
            </p>
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
