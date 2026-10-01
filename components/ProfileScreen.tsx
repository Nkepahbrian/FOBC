"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { AdelphoiButton } from "@/components/AdelphoiButton";
import { Wordmark } from "@/components/Logo";
import { readStale, writeCache } from "@/lib/cache/swr";
import { readPackedAudio, readPackedThought } from "@/lib/feed/api";
import { useAdelphoi } from "@/lib/community/adelphoi";
import { recordNotification } from "@/lib/notifications/store";
import { cardStyleById } from "@/lib/styles/cards";
import { createClient } from "@/lib/supabase/client";

type ProfilePost = {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  tags: string[];
  songTitle: string | null;
  thoughtStyle: string | null;
};

type ProfileModel = {
  id: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  website: string | null;
  instagram: string | null;
  posts: number;
  amens: number;
  followers: number;
  grid: ProfilePost[];
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isAudioUrl(url: string) {
  return /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function urlList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [value];
  }
  return [value];
}

function showVideoFrame(event: { currentTarget: HTMLVideoElement }) {
  const video = event.currentTarget;
  if (video.currentTime < 0.1) {
    try {
      video.currentTime = 0.1;
    } catch {
      /* metadata not seekable yet */
    }
  }
}

function visibleCaption(content: string) {
  return content.replace(/\s*\[\[[^\]]+\]\]/g, " ").replace(/\s+/g, " ").trim();
}

function ProfileTile({ post }: { post: ProfilePost }) {
  const [failed, setFailed] = useState(false);
  const video = post.mediaType?.startsWith("video") || (post.mediaUrl ? isVideoUrl(post.mediaUrl) : false);
  const caption = visibleCaption(post.content);
  if (!post.mediaUrl && post.thoughtStyle) {
    const style = cardStyleById(post.thoughtStyle);
    return (
      <Link href={`/post/${post.id}`} className="aspect-square overflow-hidden" aria-label={caption || "Thought"}>
        <span
          className="flex h-full w-full items-center justify-center px-2 text-center"
          style={{ background: style.background, color: style.color }}
        >
          <span className="line-clamp-6 text-[13px] font-bold leading-tight">{caption || "Blessing"}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link href={`/post/${post.id}`} className="aspect-square overflow-hidden bg-[#121212]">
      {post.mediaUrl && (video || failed) ? (
        <video
          src={`${post.mediaUrl}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={showVideoFrame}
          className="h-full w-full object-cover"
          style={{ objectFit: "cover" }}
        />
      ) : post.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          style={{ objectFit: "cover" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full items-end p-2 text-left text-[11px] leading-4 text-zinc-300">
          {post.songTitle || caption.slice(0, 80) || "Blessing"}
        </span>
      )}
    </Link>
  );
}

function withThoughts(model: ProfileModel): ProfileModel {
  return {
    ...model,
    grid: (model.grid ?? []).map((post) => {
      const thought = readPackedThought(post.content || "");
      return {
        ...post,
        content: thought.content,
        thoughtStyle: post.thoughtStyle || thought.thoughtStyle,
      };
    }),
  };
}

export function ProfileScreen({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const adelphoi = useAdelphoi();
  const viewingSelf = isOwn || (adelphoi.me !== null && adelphoi.me === userId);
  const [profile, setProfile] = useState<ProfileModel | null>(null);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");

  const load = useCallback(async (cancelled: () => boolean) => {
    const supabase = createClient();
    const [profileResult, postsResult, followResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    ]);
    const row = (profileResult.data ?? {}) as Record<string, string | null>;
    const name = row.full_name || (isOwn ? "Your profile" : "Community member");
    const posts = (postsResult.error ? [] : postsResult.data ?? []) as unknown as Record<string, unknown>[];
    const ids = posts.map((post) => String(post.id));
    let amens = 0;
    if (ids.length > 0) {
      const [amenResult, likeResult] = await Promise.all([
        supabase.from("post_amens").select("id").in("post_id", ids),
        supabase.from("likes").select("id").in("post_id", ids),
      ]);
      amens = !amenResult.error ? amenResult.data?.length ?? 0 : !likeResult.error ? likeResult.data?.length ?? 0 : 0;
    }
    const followers = followResult.error ? 0 : followResult.count ?? 0;

    if (cancelled()) return;
    const model: ProfileModel = {
        id: userId,
        fullName: name,
        bio: row.bio || (isOwn ? "Add a short bio so the community knows your story." : "FOBC member"),
        avatarUrl: row.avatar_url,
        website: row.website,
        instagram: row.instagram,
        posts: posts.length,
        amens,
        followers,
        grid: posts.map((post) => {
          const packed = readPackedAudio(String(post.content || post.caption || ""));
          const thought = readPackedThought(packed.content);
          const images = urlList(post.image_urls);
          const extras = [post.image_url, post.media_url].filter((url): url is string => typeof url === "string" && url.length > 0);
          const visual = [...images, ...extras].find((url) => !isAudioUrl(url)) ?? null;
          const storedType = (post.media_type as string | null) ?? null;
          const mediaType = !visual ? null : storedType?.startsWith("video") || isVideoUrl(visual) ? "video" : "image";
          return {
            id: String(post.id),
            content: thought.content,
            mediaUrl: visual,
            mediaType,
            tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
            songTitle: (post.song_title as string | null) ?? packed.songTitle,
            thoughtStyle: (post.thought_style as string | null) || thought.thoughtStyle,
          };
        }),
      };
    writeCache(`fobc-profile-${userId}`, model);
    setProfile(model);
  }, [isOwn, userId]);

  useEffect(() => {
    const cached = readStale<ProfileModel>(`fobc-profile-${userId}`);
    if (cached) setProfile(withThoughts(cached));
    let cancelled = false;
    load(() => cancelled).catch(() => {
      if (!cancelled) setNotice("This profile could not be loaded.");
    });
    const refresh = () => setRefreshKey((current) => current + 1);
    window.addEventListener("fobc-post-shared", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("fobc-post-shared", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load, refreshKey, userId]);

  const highlights = useMemo(() => {
    const tags = Array.from(new Set(profile?.grid.flatMap((post) => post.tags) ?? []));
    return (tags.length > 0 ? tags : ["Faith", "Worship", "Prayer", "Family"]).slice(0, 8);
  }, [profile]);

  async function uploadAvatar(file: File | undefined) {
    if (!file || !profile) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice("Choose a photo smaller than 5 MB.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setProfile({ ...profile, avatarUrl: previewUrl });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNotice("Sign in before updating your photo.");
      return;
    }
    const fileName = `${user.id}-${Date.now()}.jpg`;
    const contentType = file.type || "image/jpeg";
    let stored = await supabase.storage.from("avatars").upload(fileName, file, { contentType, upsert: false });
    let path = fileName;
    if (stored.error) {
      path = `${user.id}/${fileName}`;
      stored = await supabase.storage.from("avatars").upload(path, file, { contentType, upsert: false });
    }
    if (stored.error) {
      setNotice(stored.error.message);
      return;
    }
    const avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    if (error) {
      setNotice(error.message);
      return;
    }
    setProfile((current) => (current ? { ...current, avatarUrl } : current));
    window.dispatchEvent(new CustomEvent("fobc-avatar", { detail: { userId: user.id, avatarUrl } }));
    recordNotification({
      id: `system-avatar-${user.id}-${Date.now()}`,
      kind: "system",
      title: "Profile updated",
      body: "Your profile photo was updated.",
      href: "/profile",
    });
    setNotice("Profile photo updated.");
  }

  async function saveBio() {
    if (!profile) return;
    const next = bioDraft.trim();
    setProfile({ ...profile, bio: next || profile.bio });
    setEditingBio(false);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ bio: next }).eq("id", profile.id);
    if (error) setNotice(error.message);
  }

  async function shareProfile() {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.fullName, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    setNotice("Profile link copied.");
  }

  if (!profile) {
    return (
      <section className="px-4 pt-4">
        <div className="animate-pulse">
          <div className="h-8 w-28 rounded bg-white/10" />
          <div className="mt-4 flex items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-[#121212]" />
            <div className="grid flex-1 grid-cols-3 gap-2">
              <div className="h-8 rounded bg-white/10" />
              <div className="h-8 rounded bg-white/10" />
              <div className="h-8 rounded bg-white/10" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-0.5">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="aspect-square bg-[#121212]" />
            ))}
          </div>
        </div>
        {notice ? <p className="mt-3 text-sm text-red-300">{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className="px-4 pt-4 text-white">
      <Wordmark className="text-3xl" />
      <div className="flex items-center gap-6">
        <label className="relative cursor-pointer rounded-full bg-gradient-to-tr from-[#EAB308] via-[#FDE68A] to-[#EAB308] p-[3px]">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full border-2 border-black object-cover" style={{ objectFit: "cover" }} />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-black bg-[#121212] text-xl font-semibold text-[#EAB308]">
              {initials(profile.fullName) || "F"}
            </span>
          )}
          {viewingSelf ? (
            <>
              <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#EAB308] text-black">
                <Camera className="h-3.5 w-3.5" />
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                aria-label="Upload profile photo"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  uploadAvatar(file);
                }}
              />
            </>
          ) : null}
        </label>
        <dl className="grid flex-1 grid-cols-3 text-center">
          <div>
            <dt className="text-lg font-semibold">{profile.posts}</dt>
            <dd className="text-xs text-zinc-400">Posts</dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">{profile.amens}</dt>
            <dd className="text-xs text-zinc-400">Amens</dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">{profile.followers}</dt>
            <dd className="text-xs text-zinc-400">Adelphoi</dd>
          </div>
        </dl>
      </div>

      <h1 className="mt-4 text-sm font-semibold">{profile.fullName}</h1>
      {editingBio ? (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveBio();
          }}
        >
          <textarea
            value={bioDraft}
            onChange={(event) => setBioDraft(event.target.value)}
            rows={3}
            maxLength={160}
            aria-label="Bio"
            className="w-full rounded-2xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#EAB308]"
          />
          <button type="submit" className="mt-2 h-9 rounded-full bg-[#EAB308] px-4 text-sm font-semibold text-black">
            Save bio
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={!viewingSelf}
          onClick={() => {
            setBioDraft(profile.bio);
            setEditingBio(true);
          }}
          className="mt-1 block whitespace-pre-wrap text-left text-sm leading-5 text-zinc-300"
        >
          {profile.bio}
        </button>
      )}
      <div className="mt-2 flex flex-col gap-1 text-sm font-semibold text-[#EAB308]">
        {profile.website ? (
          <a href={profile.website} target="_blank" rel="noopener noreferrer">
            {profile.website.replace(/^https?:\/\//, "")}
          </a>
        ) : null}
        {profile.instagram ? <p>@{profile.instagram.replace(/^@/, "")}</p> : null}
      </div>

      {!viewingSelf ? (
        <div className="mt-4">
          <AdelphoiButton
            userId={profile.id}
            name={profile.fullName}
            variant="prominent"
            onChange={(connected) => {
              setProfile((current) =>
                current ? { ...current, followers: Math.max(0, current.followers + (connected ? 1 : -1)) } : current
              );
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {viewingSelf ? (
          <Link href="/onboarding" className="flex h-9 items-center justify-center rounded-lg bg-[#121212] text-sm font-semibold">
            Edit profile
          </Link>
        ) : (
          <Link href={`/chat?with=${profile.id}`} className="flex h-9 items-center justify-center rounded-lg bg-[#EAB308] text-sm font-semibold text-black">
            Message
          </Link>
        )}
        <button type="button" onClick={shareProfile} className="h-9 rounded-lg bg-[#121212] text-sm font-semibold">
          Share profile
        </button>
      </div>
      {notice ? <p className="mt-2 text-xs text-[#EAB308]">{notice}</p> : null}

      <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
        {highlights.map((item) => (
          <div key={item} className="w-16 shrink-0 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-[#121212] text-xs font-semibold text-[#EAB308]">
              {item.slice(0, 2).toUpperCase()}
            </div>
            <p className="mt-1 truncate text-[11px] text-zinc-400">{item}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-white/10 pt-0.5">
        {(profile.grid ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">No posts yet.</p>
        ) : (
          <div className="-mx-4 grid grid-cols-3 gap-0.5">
            {profile.grid.map((post) => (
              <ProfileTile key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
