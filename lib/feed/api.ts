import { fallbackPosts } from "@/lib/feed/mock";
import type { CreateCategory, FeedComment, FeedPost, LiveEvent, PostCategory } from "@/lib/feed/types";
import { isLiveEvent, postCategories } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type CommunitySnapshot = {
  posts: FeedPost[];
  events: LiveEvent[];
  isLiveActive: boolean;
  mode: "live" | "preview";
  notice: string | null;
};

type ProfileEmbed = { full_name: string | null; avatar_url: string | null } | null;

type PostRow = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  media_type: string | null;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  profiles: ProfileEmbed | ProfileEmbed[];
  likes: { user_id: string }[] | null;
  comments: { id: string }[] | null;
  prayers: { user_id: string }[] | null;
};

const postSelect = `
  id, user_id, caption, media_url, media_type, category, tags, created_at,
  profiles (full_name, avatar_url),
  likes (user_id),
  comments (id),
  prayers (user_id)
`;

function asCategory(value: string | null): PostCategory {
  if (value && postCategories.includes(value as PostCategory)) return value as PostCategory;
  return "general";
}

function mediaKind(value: string | null): FeedPost["mediaType"] {
  if (!value) return null;
  if (value.startsWith("video")) return "video";
  return "image";
}

function firstProfile(value: PostRow["profiles"]): ProfileEmbed {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapPost(row: PostRow, userId?: string): FeedPost {
  const profile = firstProfile(row.profiles);
  return {
    id: row.id,
    userId: row.user_id,
    fullName: profile?.full_name || "Blessing member",
    avatarUrl: profile?.avatar_url ?? null,
    createdAt: row.created_at,
    category: asCategory(row.category),
    content: row.caption ?? "",
    mediaUrl: row.media_url,
    mediaType: row.media_url ? mediaKind(row.media_type) : null,
    tags: row.tags ?? [],
    amenCount: row.likes?.length ?? 0,
    commentCount: row.comments?.length ?? 0,
    prayerCount: row.prayers?.length ?? 0,
    likedByMe: Boolean(userId && row.likes?.some((like) => like.user_id === userId)),
    prayedByMe: Boolean(userId && row.prayers?.some((prayer) => prayer.user_id === userId)),
    source: "live",
  };
}

function preview(notice: string): CommunitySnapshot {
  return {
    posts: fallbackPosts(),
    events: [],
    isLiveActive: false,
    mode: "preview",
    notice,
  };
}

export async function loadCommunity(): Promise<CommunitySnapshot> {
  if (!getSupabaseEnv().isConfigured) {
    return preview("Supabase is not configured. Showing sample blessings.");
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [postsResult, eventsResult] = await Promise.all([
      supabase.from("posts").select(postSelect).order("created_at", { ascending: false }),
      supabase.from("live_events").select("id, title, details, stream_url, starts_at, ends_at").order("starts_at", { ascending: true }),
    ]);

    if (postsResult.error) throw postsResult.error;

    const events: LiveEvent[] =
      eventsResult.error || !eventsResult.data
        ? []
        : eventsResult.data.map((event) => ({
            id: event.id,
            title: event.title,
            details: event.details ?? "",
            streamUrl: event.stream_url ?? "",
            startsAt: event.starts_at,
            endsAt: event.ends_at,
          }));
    const isLiveActive = events.some((event) => isLiveEvent(event));

    const posts = ((postsResult.data ?? []) as PostRow[]).map((row) => mapPost(row, user?.id));

    if (posts.length === 0) {
      return {
        posts: fallbackPosts(),
        events,
        isLiveActive,
        mode: "preview",
        notice: "No posts yet. Sample blessings are shown until the first testimony is shared.",
      };
    }

    return { posts, events, isLiveActive, mode: "live", notice: null };
  } catch {
    return preview("Showing sample blessings until the live feed responds.");
  }
}

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function toggleAmen(post: FeedPost): Promise<FeedPost> {
  const likedByMe = !post.likedByMe;
  const next = {
    ...post,
    likedByMe,
    amenCount: Math.max(0, post.amenCount + (likedByMe ? 1 : -1)),
  };

  if (post.source === "preview" || !getSupabaseEnv().isConfigured) return next;

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return next;

    const result = post.likedByMe
      ? await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", userId)
      : await supabase.from("likes").insert({ post_id: post.id, user_id: userId });

    if (result.error) return next;
    return next;
  } catch {
    return next;
  }
}

export async function togglePrayer(post: FeedPost): Promise<FeedPost> {
  const prayedByMe = !post.prayedByMe;
  const next = {
    ...post,
    prayedByMe,
    prayerCount: Math.max(0, post.prayerCount + (prayedByMe ? 1 : -1)),
  };

  if (post.source === "preview" || !getSupabaseEnv().isConfigured) return next;

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return next;

    const result = post.prayedByMe
      ? await supabase.from("prayers").delete().eq("post_id", post.id).eq("user_id", userId)
      : await supabase.from("prayers").insert({ post_id: post.id, user_id: userId });

    if (result.error) return next;
    return next;
  } catch {
    return next;
  }
}

export async function loadComments(postId: string): Promise<FeedComment[]> {
  if (!getSupabaseEnv().isConfigured || postId.startsWith("preview-")) return [];

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, content, created_at, profiles (full_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        postId: row.post_id,
        fullName: profile?.full_name || "Blessing member",
        content: row.content,
        createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function addComment(postId: string, content: string): Promise<FeedComment | null> {
  const text = content.trim();
  if (!text) return null;

  if (!getSupabaseEnv().isConfigured || postId.startsWith("preview-")) {
    return {
      id: `local-${Date.now()}`,
      postId,
      fullName: "You",
      content: text,
      createdAt: new Date().toISOString(),
    };
  }

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: userId, content: text })
      .select("id, post_id, content, created_at")
      .single();

    if (error || !data) {
      return {
        id: `local-${Date.now()}`,
        postId,
        fullName: "You",
        content: text,
        createdAt: new Date().toISOString(),
      };
    }

    return {
      id: data.id,
      postId: data.post_id,
      fullName: "You",
      content: data.content,
      createdAt: data.created_at,
    };
  } catch {
    return {
      id: `local-${Date.now()}`,
      postId,
      fullName: "You",
      content: text,
      createdAt: new Date().toISOString(),
    };
  }
}

export async function createCommunityPost(input: {
  category: CreateCategory;
  content: string;
  tags: string[];
  file: File | null;
}) {
  if (!getSupabaseEnv().isConfigured) {
    return { ok: false as const, message: "Supabase is not configured yet." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, message: "Sign in before sharing a post." };

  let mediaUrl: string | null = null;
  let mediaType: string | null = null;

  if (input.file) {
    const extension = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("posts").upload(path, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

    if (uploadError) return { ok: false as const, message: uploadError.message };

    mediaUrl = supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
    mediaType = input.file.type.startsWith("video") ? "video" : "image";
  }

  const { error } = await supabase.from("posts").insert({
    user_id: user.id,
    caption: input.content.trim(),
    category: input.category,
    tags: input.tags,
    media_url: mediaUrl,
    media_type: mediaType,
  });

  if (error) {
    const missingColumn = /category|tags/i.test(error.message);
    return {
      ok: false as const,
      message: missingColumn
        ? "Run supabase/phase3.sql in the Supabase SQL editor, then try again."
        : error.message,
    };
  }

  return { ok: true as const };
}
