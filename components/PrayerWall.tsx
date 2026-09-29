"use client";

import { FeedCard } from "@/components/FeedCard";
import type { FeedComment, FeedPost } from "@/lib/feed/types";

type PrayerWallProps = {
  posts: FeedPost[];
  commentsByPost: Record<string, FeedComment[]>;
  openComments: string | null;
  onToggleComments: (postId: string) => void;
  onAmen: (postId: string) => void;
  onPray: (postId: string) => void;
  onComment: (postId: string, content: string) => void;
};

export function PrayerWall({
  posts,
  commentsByPost,
  openComments,
  onToggleComments,
  onAmen,
  onPray,
  onComment,
}: PrayerWallProps) {
  const requests = posts.filter((post) => post.category === "prayer_request");

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">Prayer wall</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#0F172A]">Active requests</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {requests.length === 0
            ? "No prayer requests are active right now."
            : `${requests.length} request${requests.length === 1 ? "" : "s"} waiting for prayer.`}
        </p>
      </div>
      <div className="-mx-4 divide-y divide-slate-100">
      {requests.map((post) => (
        <FeedCard
          key={post.id}
          post={post}
          emphasizePrayer
          comments={commentsByPost[post.id] ?? []}
          commentsOpen={openComments === post.id}
          onToggleComments={onToggleComments}
          onAmen={onAmen}
          onPray={onPray}
          onComment={onComment}
        />
      ))}
      </div>
    </section>
  );
}
