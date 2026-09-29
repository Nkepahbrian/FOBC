export const postCategories = ["testimony", "prayer_request", "sermon_note", "general"] as const;

export type PostCategory = (typeof postCategories)[number];

export const createCategories = ["testimony", "prayer_request", "general"] as const;

export type CreateCategory = (typeof createCategories)[number];

export const postTags = ["Faith", "Healing", "Family", "Worship", "Gratitude", "Convention"] as const;

export type FeedPost = {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  category: PostCategory;
  content: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | "audio" | null;
  tags: string[];
  amenCount: number;
  commentCount: number;
  prayerCount: number;
  likedByMe: boolean;
  prayedByMe: boolean;
  source: "live" | "preview";
  pinned: boolean;
  featured: boolean;
  location: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songUrl: string | null;
  audioUrl: string | null;
};

export type FeedComment = {
  id: string;
  postId: string;
  fullName: string;
  content: string;
  createdAt: string;
};

export type LiveEvent = {
  id: string;
  title: string;
  details: string;
  streamUrl: string;
  startsAt: string;
  endsAt: string | null;
};

export function categoryLabel(category: PostCategory) {
  switch (category) {
    case "testimony":
      return "Testimony";
    case "prayer_request":
      return "Prayer Request";
    case "sermon_note":
      return "Sermon Note";
    default:
      return "General";
  }
}

export function formatTimestamp(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function isConventionActive(now = Date.now(), live = false) {
  const date = new Date(now);
  const festivalMonth = date.getFullYear() === 2026 && date.getMonth() === 10;
  return live || festivalMonth;
}

export function isLiveEvent(event: LiveEvent, now = Date.now()) {
  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt ? new Date(event.endsAt).getTime() : Number.POSITIVE_INFINITY;
  return start <= now && now < end;
}
