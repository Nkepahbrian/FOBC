import type { CreateCategory, FeedComment, FeedPost, LiveEvent, PostCategory } from "@/lib/feed/types";
import { isConventionActive, isLiveEvent, postCategories } from "@/lib/feed/types";
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

function asCategory(value: string | null): PostCategory {
  if (value && postCategories.includes(value as PostCategory)) return value as PostCategory;
  return "general";
}

function mediaKind(value: string | null): FeedPost["mediaType"] {
  if (!value) return null;
  if (value.startsWith("video")) return "video";
  if (value.startsWith("audio")) return "audio";
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
    pinned: false,
    featured: false,
    location: null,
    songTitle: null,
    songArtist: null,
    songUrl: null,
    audioUrl: null,
  };
}

const audioMark = /\n*\[\[fobc-audio:([^\]|]+)\|([^\]|]*)\|([^\]|]*)\]\]\s*$/;

export function readPackedAudio(value: string) {
  const match = value.match(audioMark);
  if (!match || match.index === undefined) {
    return { content: value, audioUrl: null as string | null, songTitle: null as string | null, songArtist: null as string | null };
  }
  const title = decodeURIComponent(match[2] || "");
  const artist = decodeURIComponent(match[3] || "");
  return {
    content: value.slice(0, match.index).trimEnd(),
    audioUrl: decodeURIComponent(match[1]),
    songTitle: title || null,
    songArtist: artist || null,
  };
}

function packAudio(content: string, audioUrl: string | null, title: string, artist: string) {
  if (!audioUrl) return content;
  return `${content}\n\n[[fobc-audio:${encodeURIComponent(audioUrl)}|${encodeURIComponent(title)}|${encodeURIComponent(artist)}]]`;
}

function missingRelation(message: string) {
  return /does not exist|schema cache|could not find the table|relation/i.test(message);
}

function emptyFeed(notice: string, events: LiveEvent[] = []): CommunitySnapshot {
  return {
    posts: [],
    events,
    isLiveActive: events.some((event) => isLiveEvent(event)),
    mode: "live",
    notice,
  };
}

type LoosePost = {
  id: string;
  user_id: string;
  caption?: string | null;
  content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  category?: string | null;
  tags?: string[] | null;
  created_at: string;
  location?: string | null;
  song_title?: string | null;
  song_artist?: string | null;
  song_url?: string | null;
  audio_url?: string | null;
  is_pinned?: boolean | null;
  profiles?: ProfileEmbed | ProfileEmbed[];
};

async function attachProfiles(supabase: ReturnType<typeof createClient>, rows: LoosePost[]) {
  const ids = Array.from(new Set(rows.map((row) => row.user_id)));
  if (ids.length === 0) return rows;

  const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const byId = new Map((data ?? []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    profiles: row.profiles ?? byId.get(row.user_id) ?? null,
  }));
}

async function selectPosts(supabase: ReturnType<typeof createClient>) {
  const columnSets = [
    "id, user_id, content, media_url, media_type, category, tags, created_at, location, song_title, song_artist, song_url, audio_url, is_pinned",
    "id, user_id, content, media_url, media_type, category, tags, created_at, location, song_title, song_artist, song_url, is_pinned",
    "id, user_id, content, media_url, media_type, category, tags, created_at, song_title, song_artist, song_url, audio_url",
    "id, user_id, content, media_url, media_type, category, tags, created_at, song_title, song_artist, song_url",
    "id, user_id, content, media_url, media_type, category, tags, created_at",
    "id, user_id, content, category, tags, created_at",
    "id, user_id, content, created_at",
    "id, user_id, caption, media_url, media_type, category, tags, created_at",
    "id, user_id, caption, created_at",
  ];
  let lastMessage = "The live feed could not be loaded.";

  for (const columns of columnSets) {
    const joined = await supabase
      .from("posts")
      .select(`${columns}, profiles(full_name, avatar_url)`)
      .order("created_at", { ascending: false });

    if (!joined.error) return (joined.data ?? []) as unknown as LoosePost[];

    const plain = await supabase.from("posts").select(columns).order("created_at", { ascending: false });
    if (!plain.error) return attachProfiles(supabase, (plain.data ?? []) as unknown as LoosePost[]);
    lastMessage = plain.error.message;
  }

  throw new Error(lastMessage);
}

type EngagementRow = { id?: string; post_id: string; user_id?: string };

async function selectEngagement(
  supabase: ReturnType<typeof createClient>,
  tables: string[],
  columns: string
) {
  for (const table of tables) {
    const result = await supabase.from(table).select(columns);
    if (!result.error) return (result.data ?? []) as unknown as EngagementRow[];
    if (!missingRelation(result.error.message)) return [];
  }
  return [] as EngagementRow[];
}

export async function loadCommunity(): Promise<CommunitySnapshot> {
  if (!getSupabaseEnv().isConfigured) {
    return emptyFeed("Supabase is not configured.");
  }

  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [rows, eventsResult, amens, commentRows, prayers] = await Promise.all([
      selectPosts(supabase),
      supabase.from("live_events").select("id, title, details, stream_url, starts_at, ends_at").order("starts_at", { ascending: true }),
      selectEngagement(supabase, ["post_amens", "likes"], "post_id, user_id"),
      selectEngagement(supabase, ["post_comments", "comments"], "id, post_id"),
      selectEngagement(supabase, ["prayers"], "post_id, user_id"),
    ]);

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

    const posts = rows.map((row) => {
      const mapped = mapPost(
        {
          id: row.id,
          user_id: row.user_id,
          caption: row.content || row.caption || "",
          media_url: row.media_url ?? null,
          media_type: row.media_type ?? null,
          category: row.category ?? "general",
          tags: row.tags ?? [],
          created_at: row.created_at,
          profiles: row.profiles ?? null,
          likes: amens
            .filter((amen) => amen.post_id === row.id && amen.user_id)
            .map((amen) => ({ user_id: amen.user_id as string })),
          comments: commentRows
            .filter((comment) => comment.post_id === row.id && comment.id)
            .map((comment) => ({ id: comment.id as string })),
          prayers: prayers
            .filter((prayer) => prayer.post_id === row.id && prayer.user_id)
            .map((prayer) => ({ user_id: prayer.user_id as string })),
        },
        user?.id
      );
      return mapped;
    });

    const isLiveActive = events.some((event) => isLiveEvent(event));
    const convention = isConventionActive(Date.now(), isLiveActive);
    const ranked = rankPosts(
      posts.map((post, index) => {
        const row = rows[index];
        const packed = readPackedAudio(row?.content || row?.caption || post.content);
        const audioUrl = row?.audio_url || row?.song_url || (post.mediaType === "audio" ? post.mediaUrl : null) || packed.audioUrl;
        return {
          ...post,
          content: packed.content,
          location: row?.location ?? null,
          songTitle: row?.song_title || packed.songTitle,
          songArtist: row?.song_artist || packed.songArtist,
          audioUrl,
          songUrl: audioUrl,
          pinned: Boolean(row?.is_pinned),
          mediaType: audioUrl && !row?.media_url ? "audio" : post.mediaType,
        };
      }),
      convention
    );

    return {
      posts: ranked,
      events,
      isLiveActive,
      mode: "live",
      notice: null,
    };
  } catch {
    return emptyFeed("The live feed could not be loaded.");
  }
}

function rankPosts(posts: FeedPost[], convention: boolean) {
  const byEngagement = (left: FeedPost, right: FeedPost) => {
    const pin = Number(right.pinned) - Number(left.pinned);
    if (pin) return pin;
    if (right.amenCount !== left.amenCount) return right.amenCount - left.amenCount;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  };

  const sorted = [...posts].sort(byEngagement);
  if (!convention || sorted.length === 0) return sorted;

  const featured = [...sorted].sort(
    (left, right) =>
      right.amenCount - left.amenCount ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )[0];

  return [
    { ...featured, pinned: true, featured: true },
    ...sorted.filter((post) => post.id !== featured.id).map((post) => ({ ...post, featured: false })),
  ];
}

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export function optimisticAmen(post: FeedPost): FeedPost {
  const likedByMe = !post.likedByMe;
  return {
    ...post,
    likedByMe,
    amenCount: Math.max(0, post.amenCount + (likedByMe ? 1 : -1)),
  };
}

export function optimisticPrayer(post: FeedPost): FeedPost {
  const prayedByMe = !post.prayedByMe;
  return {
    ...post,
    prayedByMe,
    prayerCount: Math.max(0, post.prayerCount + (prayedByMe ? 1 : -1)),
  };
}

async function writeToggle(
  tables: string[],
  active: boolean,
  postId: string
) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return false;

  for (const table of tables) {
    const result = active
      ? await supabase.from(table).delete().eq("post_id", postId).eq("user_id", userId)
      : await supabase.from(table).insert({ post_id: postId, user_id: userId });

    if (!result.error) return true;
    if (!missingRelation(result.error.message)) return false;
  }

  return false;
}

export async function persistAmen(post: FeedPost) {
  if (!getSupabaseEnv().isConfigured) return false;
  return writeToggle(["post_amens", "likes"], post.likedByMe, post.id);
}

export async function persistPrayer(post: FeedPost) {
  if (!getSupabaseEnv().isConfigured) return false;
  return writeToggle(["prayers"], post.prayedByMe, post.id);
}

export async function toggleAmen(post: FeedPost) {
  const next = optimisticAmen(post);
  await persistAmen(post);
  return next;
}

export async function togglePrayer(post: FeedPost) {
  const next = optimisticPrayer(post);
  await persistPrayer(post);
  return next;
}

export async function loadComments(postId: string): Promise<FeedComment[]> {
  if (!getSupabaseEnv().isConfigured) return [];

  try {
    const supabase = createClient();
    const tables = ["post_comments", "comments"];

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select("id, post_id, content, created_at, profiles (full_name)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (error) {
        if (missingRelation(error.message)) continue;
        return [];
      }

      return (data ?? []).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          postId: row.post_id,
          fullName: profile?.full_name || "Blessing member",
          content: row.content,
          createdAt: row.created_at,
        };
      });
    }

    return [];
  } catch {
    return [];
  }
}

export async function addComment(postId: string, content: string): Promise<FeedComment | null> {
  const text = content.trim();
  if (!text || !getSupabaseEnv().isConfigured) return null;

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return null;

    const tables = ["post_comments", "comments"];
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .insert({ post_id: postId, user_id: userId, content: text })
        .select("id, post_id, content, created_at")
        .single();

      if (!error && data) {
        return {
          id: data.id,
          postId: data.post_id,
          fullName: "You",
          content: data.content,
          createdAt: data.created_at,
        };
      }

      if (error && !missingRelation(error.message)) return null;
    }

    return null;
  } catch {
    return null;
  }
}

export async function createCommunityPost(input: {
  category: CreateCategory;
  content: string;
  tags: string[];
  file: File | null;
  audio: File | null;
  songTitle: string;
  songArtist: string;
  audioUrl: string | null;
  location: string;
  taggedUserIds: string[];
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
    mediaType = input.file.type.startsWith("video") ? "video" : input.file.type.startsWith("audio") ? "audio" : "image";
  }

  let audioUrl: string | null = input.audioUrl;
  if (input.audio) {
    const extension = input.audio.name.split(".").pop()?.toLowerCase() || "mp3";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const contentType =
      input.audio.type || (extension === "wav" ? "audio/wav" : extension === "m4a" ? "audio/mp4" : "audio/mpeg");
    const uploaded = await supabase.storage.from("music_tracks").upload(path, input.audio, {
      contentType,
      upsert: false,
    });
    const stored = uploaded.error
      ? await supabase.storage.from("posts").upload(path, input.audio, { contentType, upsert: false })
      : uploaded;
    if (stored.error) return { ok: false as const, message: uploaded.error?.message || stored.error.message };
    const bucket = uploaded.error ? "posts" : "music_tracks";
    audioUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  if (audioUrl && !mediaUrl) {
    mediaUrl = audioUrl;
    mediaType = "audio";
  }

  const text = packAudio(input.content.trim(), audioUrl, input.songTitle.trim(), input.songArtist.trim());
  const payload: Record<string, unknown> = {
    user_id: user.id,
    content: text,
    caption: text,
    category: input.category,
    tags: input.tags,
    media_url: mediaUrl,
    media_type: mediaType,
    location: input.location.trim() || null,
    song_title: input.songTitle.trim() || null,
    song_artist: input.songArtist.trim() || null,
    song_url: audioUrl,
    audio_url: audioUrl,
    tagged_user_ids: input.taggedUserIds,
  };

  let { error } = await supabase.from("posts").insert(payload);

  for (let attempt = 0; attempt < 12 && error; attempt += 1) {
    const message = error.message;
    if (/caption/i.test(message)) delete payload.caption;
    else if (/content/i.test(message)) {
      delete payload.content;
      payload.caption = text;
    } else if (/category/i.test(message)) delete payload.category;
    else if (/tags/i.test(message)) delete payload.tags;
    else if (/media_url/i.test(message)) delete payload.media_url;
    else if (/media_type/i.test(message)) delete payload.media_type;
    else if (/location/i.test(message)) delete payload.location;
    else if (/song_title/i.test(message)) delete payload.song_title;
    else if (/song_artist/i.test(message)) delete payload.song_artist;
    else if (/audio_url/i.test(message)) delete payload.audio_url;
    else if (/song_url/i.test(message)) delete payload.song_url;
    else if (/tagged_user_ids/i.test(message)) delete payload.tagged_user_ids;
    else break;

    ({ error } = await supabase.from("posts").insert(payload));
  }

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const };
}
