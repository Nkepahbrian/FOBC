import type { CreateCategory, FeedComment, FeedPost, LiveEvent, PostCategory } from "@/lib/feed/types";
import { isConventionActive, isLiveEvent, postCategories } from "@/lib/feed/types";
import { writeCache } from "@/lib/cache/swr";
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
    imageUrl: null,
    imageUrls: [],
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
    songSnippetStart: 0,
    songSnippetLength: 15,
    thoughtStyle: null,
  };
}

const audioMark = /\n*\[\[fobc-audio:([^\]|]+)\|([^\]|]*)\|([^\]|]*)(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]\]\s*$/;

export function readPackedAudio(value: string) {
  const match = value.match(audioMark);
  if (!match || match.index === undefined) {
    return {
      content: value,
      audioUrl: null as string | null,
      songTitle: null as string | null,
      songArtist: null as string | null,
      songSnippetStart: 0,
      songSnippetLength: 15,
    };
  }
  const title = decodeURIComponent(match[2] || "");
  const artist = decodeURIComponent(match[3] || "");
  const start = Number(match[4]);
  const length = Number(match[5]);
  return {
    content: value.slice(0, match.index).trimEnd(),
    audioUrl: decodeURIComponent(match[1]),
    songTitle: title || null,
    songArtist: artist || null,
    songSnippetStart: Number.isFinite(start) ? start : 0,
    songSnippetLength: length === 25 ? 25 : 15,
  };
}

const thoughtMark = /\n*\[\[fobc-thought:([a-z0-9-]+)\]\]/;

export function readPackedThought(value: string) {
  const match = value.match(thoughtMark);
  if (!match || match.index === undefined) return { content: value, thoughtStyle: null as string | null };
  return {
    content: `${value.slice(0, match.index)}${value.slice(match.index + match[0].length)}`.trim(),
    thoughtStyle: match[1],
  };
}

function packThought(content: string, style: string | null) {
  if (!style) return content;
  return `${content.trim()}\n\n[[fobc-thought:${style}]]`;
}

function packAudio(
  content: string,
  audioUrl: string | null,
  title: string,
  artist: string,
  start = 0,
  length = 15
) {
  if (!audioUrl) return content;
  const clip = length === 25 ? 25 : 15;
  return `${content}\n\n[[fobc-audio:${encodeURIComponent(audioUrl)}|${encodeURIComponent(title)}|${encodeURIComponent(artist)}|${Math.max(0, start)}|${clip}]]`;
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
  image_url?: string | null;
  image_urls?: string[] | null;
  category?: string | null;
  tags?: string[] | null;
  created_at: string;
  location?: string | null;
  song_title?: string | null;
  song_artist?: string | null;
  song_url?: string | null;
  audio_url?: string | null;
  song_snippet_start?: number | null;
  thought_style?: string | null;
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

let joinProfiles = true;

async function selectPosts(supabase: ReturnType<typeof createClient>) {
  if (joinProfiles) {
    const joined = await supabase.from("posts").select("*, profiles(full_name, avatar_url)").order("created_at", { ascending: false }).limit(20);
    if (!joined.error) return (joined.data ?? []) as unknown as LoosePost[];
    joinProfiles = false;
  }

  const plain = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(20);
  if (!plain.error) return attachProfiles(supabase, (plain.data ?? []) as unknown as LoosePost[]);
  throw new Error(plain.error.message);
}

type EngagementRow = { id?: string; post_id: string; user_id?: string };

function shapePost(
  row: LoosePost,
  userId: string | undefined,
  amens: EngagementRow[],
  commentRows: EngagementRow[],
  prayers: EngagementRow[]
): FeedPost {
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
    userId
  );
  const packed = readPackedAudio(row.content || row.caption || mapped.content);
  const thought = readPackedThought(packed.content);
  const audioUrl = row.audio_url || row.song_url || (mapped.mediaType === "audio" ? mapped.mediaUrl : null) || packed.audioUrl;
  const imageUrl = row.image_url || (row.media_url && row.media_type !== "audio" ? row.media_url : null);
  const listed = Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [];
  const imageUrls = listed.length > 0 ? listed : imageUrl ? [imageUrl] : [];
  return {
    ...mapped,
    content: thought.content,
    thoughtStyle: row.thought_style || thought.thoughtStyle,
    imageUrl,
    imageUrls,
    location: row.location ?? null,
    songTitle: row.song_title || packed.songTitle,
    songArtist: row.song_artist || packed.songArtist,
    audioUrl,
    songUrl: audioUrl,
    songSnippetStart: Number(row.song_snippet_start ?? packed.songSnippetStart) || 0,
    songSnippetLength: packed.songSnippetLength === 25 ? 25 : 15,
    pinned: Boolean(row.is_pinned),
    mediaType: audioUrl && !row.media_url ? "audio" : mapped.mediaType,
  };
}

async function engagementForPost(
  supabase: ReturnType<typeof createClient>,
  tables: string[],
  postId: string,
  columns: string
) {
  for (const table of tables) {
    const result = await supabase.from(table).select(columns).eq("post_id", postId);
    if (!result.error) return (result.data ?? []) as unknown as EngagementRow[];
    if (!missingRelation(result.error.message)) return [];
  }
  return [] as EngagementRow[];
}

export async function loadPost(id: string): Promise<FeedPost | null> {
  if (!getSupabaseEnv().isConfigured) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let row: LoosePost | null = null;
  const joined = await supabase.from("posts").select("*, profiles(full_name, avatar_url)").eq("id", id).maybeSingle();
  if (!joined.error && joined.data) row = joined.data as unknown as LoosePost;
  else {
    const plain = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
    if (plain.error || !plain.data) return null;
    const [hydrated] = await attachProfiles(supabase, [plain.data as unknown as LoosePost]);
    row = hydrated ?? null;
  }
  if (!row) return null;

  const [amens, commentRows, prayers] = await Promise.all([
    engagementForPost(supabase, ["post_amens", "likes"], id, "post_id, user_id"),
    engagementForPost(supabase, ["post_comments", "comments"], id, "id, post_id"),
    engagementForPost(supabase, ["prayers"], id, "post_id, user_id"),
  ]);
  return shapePost(row, user?.id, amens, commentRows, prayers);
}

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

    const posts = rows.map((row) => shapePost(row, user?.id, amens, commentRows, prayers));

    const isLiveActive = events.some((event) => isLiveEvent(event));
    const convention = isConventionActive(Date.now(), isLiveActive);
    const ranked = rankPosts(posts, convention);

    const snapshot = {
      posts: ranked,
      events,
      isLiveActive,
      mode: "live" as const,
      notice: null,
    };
    writeCache("fobc-feed", snapshot);
    return snapshot;
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
  const saved = await writeToggle(["post_amens", "likes"], post.likedByMe, post.id);
  if (!saved) return false;
  const nextCount = Math.max(0, post.amenCount + (post.likedByMe ? -1 : 1));
  const supabase = createClient();
  await supabase.from("posts").update({ likes_count: nextCount }).eq("id", post.id);
  return true;
}

export async function loadLeaderboard() {
  const supabase = createClient();
  const ranked = await supabase.from("posts").select("*").order("likes_count", { ascending: false }).limit(10);
  const community = await loadCommunity();
  if (!ranked.error && ranked.data && ranked.data.length > 0) {
    const ids = new Set(ranked.data.map((row) => String((row as { id: string }).id)));
    const matched = community.posts.filter((post) => ids.has(post.id));
    const posts = (matched.length > 0 ? matched : community.posts)
      .slice()
      .sort((left, right) => right.amenCount - left.amenCount || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 10);
    writeCache("fobc-leaderboard", posts);
    return posts;
  }
  const posts = community.posts
    .slice()
    .sort((left, right) => right.amenCount - left.amenCount || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 10);
  writeCache("fobc-leaderboard", posts);
  return posts;
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

async function uploadStorage(
  supabase: ReturnType<typeof createClient>,
  buckets: string[],
  path: string,
  file: Blob,
  contentType: string
) {
  let message = "Storage bucket was not found. Run supabase/phase6.sql and supabase/phase7.sql in the Supabase SQL editor.";
  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType, upsert: false });
    if (!error) return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
    const missing = /bucket not found|does not exist/i.test(error.message);
    message = missing
      ? "Storage bucket was not found. Run supabase/phase6.sql and supabase/phase7.sql in the Supabase SQL editor."
      : error.message;
    if (!missing) break;
  }
  return { message };
}

export async function createCommunityPost(input: {
  category: CreateCategory;
  content: string;
  tags: string[];
  files: File[];
  audio: File | null;
  songTitle: string;
  songArtist: string;
  audioUrl: string | null;
  location: string;
  taggedUserIds: string[];
  songSnippetStart: number | null;
  songSnippetLength: number;
  thoughtStyle?: string | null;
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
  const imageUrls: string[] = [];

  for (const file of input.files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const contentType = file.type || (/\.(mp4|webm|mov)$/i.test(file.name) ? "video/mp4" : "image/jpeg");
    const stored = await uploadStorage(supabase, ["posts", "music_tracks"], path, file, contentType);
    if ("message" in stored) return { ok: false as const, message: stored.message };
    imageUrls.push(stored.url);
    if (!mediaUrl) {
      mediaUrl = stored.url;
      mediaType = file.type.startsWith("video") ? "video" : "image";
    }
  }

  let audioUrl: string | null = input.audioUrl;
  if (input.audio) {
    const extension = input.audio.name.split(".").pop()?.toLowerCase() || "mp3";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const contentType =
      input.audio.type || (extension === "wav" ? "audio/wav" : extension === "m4a" ? "audio/mp4" : "audio/mpeg");
    const stored = await uploadStorage(supabase, ["music_tracks", "posts"], path, input.audio, contentType);
    if ("message" in stored) return { ok: false as const, message: stored.message };
    audioUrl = stored.url;
  }

  if (audioUrl && !mediaUrl) {
    mediaUrl = audioUrl;
    mediaType = "audio";
  }

  const text = packAudio(
    packThought(input.content.trim(), input.thoughtStyle ?? null),
    audioUrl,
    input.songTitle.trim(),
    input.songArtist.trim(),
    input.songSnippetStart ?? 0,
    input.songSnippetLength
  );
  const payload: Record<string, unknown> = {
    user_id: user.id,
    content: text,
    caption: text,
    category: input.category,
    tags: input.tags,
    media_url: mediaUrl,
    media_type: mediaType,
    image_url: imageUrls[0] ?? null,
    image_urls: imageUrls,
    location: input.location.trim() || null,
    song_title: input.songTitle.trim() || null,
    song_artist: input.songArtist.trim() || null,
    song_url: audioUrl,
    audio_url: audioUrl,
    song_snippet_start: input.songSnippetStart,
    tagged_user_ids: input.taggedUserIds,
    thought_style: input.thoughtStyle ?? null,
  };

  let { error } = await supabase.from("posts").insert(payload);

  for (let attempt = 0; attempt < 16 && error; attempt += 1) {
    const message = error.message;
    if (/caption/i.test(message)) delete payload.caption;
    else if (/content/i.test(message)) {
      delete payload.content;
      payload.caption = text;
    } else if (/category/i.test(message)) delete payload.category;
    else if (/tags/i.test(message)) delete payload.tags;
    else if (/media_url/i.test(message)) delete payload.media_url;
    else if (/image_urls/i.test(message)) delete payload.image_urls;
    else if (/image_url/i.test(message)) delete payload.image_url;
    else if (/media_type/i.test(message)) delete payload.media_type;
    else if (/location/i.test(message)) delete payload.location;
    else if (/song_snippet_start/i.test(message)) delete payload.song_snippet_start;
    else if (/song_title/i.test(message)) delete payload.song_title;
    else if (/song_artist/i.test(message)) delete payload.song_artist;
    else if (/audio_url/i.test(message)) delete payload.audio_url;
    else if (/song_url/i.test(message)) delete payload.song_url;
    else if (/tagged_user_ids/i.test(message)) delete payload.tagged_user_ids;
    else if (/thought_style/i.test(message)) delete payload.thought_style;
    else break;

    ({ error } = await supabase.from("posts").insert(payload));
  }

  if (error) return { ok: false as const, message: error.message };

  const latest = await supabase.from("posts").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return {
    ok: true as const,
    id: latest.data?.id ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    audioUrl,
  };
}

export async function updatePostContent(post: FeedPost, content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 2) return "Write a few words before saving.";

  const text = packAudio(
    packThought(trimmed, post.thoughtStyle),
    post.audioUrl || post.songUrl,
    post.songTitle || "",
    post.songArtist || "",
    post.songSnippetStart,
    post.songSnippetLength
  );
  const supabase = createClient();
  const payload: Record<string, unknown> = { content: text, caption: text };
  let { error } = await supabase.from("posts").update(payload).eq("id", post.id);

  for (let attempt = 0; attempt < 4 && error; attempt += 1) {
    const message = error.message;
    if (/caption/i.test(message)) delete payload.caption;
    else if (/content/i.test(message)) {
      delete payload.content;
      payload.caption = text;
    } else break;
    ({ error } = await supabase.from("posts").update(payload).eq("id", post.id));
  }

  return error ? error.message : null;
}

export async function deletePost(postId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  return error ? error.message : null;
}

export async function reportPost(postId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Sign in to report a post.";

  const { error } = await supabase.from("post_reports").insert({
    post_id: postId,
    user_id: user.id,
    reason: "community",
  });
  if (error && missingRelation(error.message)) return null;
  return error ? error.message : null;
}
