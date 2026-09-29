"use client";

import Link from "next/link";
import { Heart, MapPin, MessageCircle, Pause, Play, Share2, HandHeart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeedPost } from "@/lib/feed/types";
import { categoryLabel, formatTimestamp } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

type FeedCardProps = {
  post: FeedPost;
  commentsOpen: boolean;
  onToggleComments: (postId: string) => void;
  onAmen: (postId: string) => void;
  onPray: (postId: string) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function FeedCard({ post, commentsOpen, onToggleComments, onAmen, onPray }: FeedCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const profileHref = `/profile/${post.userId}`;
  const audioSrc = post.audioUrl || post.songUrl;
  const showMusic = Boolean(audioSrc || post.songTitle);

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

  useEffect(() => {
    function onOther(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (id === post.id) return;
      audioRef.current?.pause();
      setPlaying(false);
    }
    window.addEventListener("fobc-audio", onOther);
    return () => window.removeEventListener("fobc-audio", onOther);
  }, [post.id]);

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent("fobc-audio", { detail: post.id }));
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <article id={`post-${post.id}`} className="border-b border-white/10 bg-black pb-3">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={profileHref} className="shrink-0 rounded-full bg-gradient-to-tr from-[#EAB308] to-[#FDE68A] p-[2px]" aria-label={post.fullName}>
          {post.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-black object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-black bg-[#121212] text-[11px] font-semibold text-[#EAB308]">
              {initials(post.fullName)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={profileHref} className="truncate text-sm font-semibold text-white">
              {post.fullName}
            </Link>
            <time className="shrink-0 text-xs text-zinc-500" dateTime={post.createdAt}>
              {formatTimestamp(post.createdAt)}
            </time>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
            {post.location ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0 text-[#EAB308]" />
                {post.location}
              </span>
            ) : (
              <span>{categoryLabel(post.category)}</span>
            )}
            {post.featured ? <span className="font-semibold text-[#EAB308]">Top Blessing</span> : null}
          </div>
        </div>
      </header>

      {post.mediaUrl && (post.mediaType === "video" || post.mediaType === "image") ? (
        <div className="relative">
          {post.mediaType === "video" ? (
            <video src={post.mediaUrl} controls playsInline className="max-h-[32rem] w-full bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrl} alt="" className="max-h-[32rem] w-full object-cover" />
          )}
          {showMusic ? (
            <div className="absolute bottom-3 left-3 right-3">
              <MusicPill
                title={post.songTitle || "Gospel track"}
                artist={post.songArtist || "FOBC"}
                playing={playing}
                canPlay={Boolean(audioSrc)}
                onToggle={toggleAudio}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-4">
        {post.content ? <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-white">{post.content}</p> : null}

        {showMusic && !(post.mediaUrl && (post.mediaType === "video" || post.mediaType === "image")) ? (
          <div className="mt-3">
            <MusicPill
              title={post.songTitle || "Gospel track"}
              artist={post.songArtist || "FOBC"}
              playing={playing}
              canPlay={Boolean(audioSrc)}
              onToggle={toggleAudio}
            />
          </div>
        ) : null}
        {audioSrc ? <audio ref={audioRef} src={audioSrc} preload="none" onEnded={() => setPlaying(false)} className="hidden" /> : null}

        {post.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag} className="text-xs font-medium text-[#EAB308]">
                #{tag.replace(/\s+/g, "")}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onAmen(post.id)}
            aria-pressed={post.likedByMe}
            className={cn("flex h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold", post.likedByMe ? "text-[#EAB308]" : "text-white")}
          >
            <Heart className={cn("h-6 w-6", post.likedByMe && "fill-[#EAB308] text-[#EAB308]")} />
            {post.amenCount}
          </button>
          <button
            type="button"
            onClick={() => onToggleComments(post.id)}
            aria-expanded={commentsOpen}
            className="flex h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-6 w-6" />
            {post.commentCount}
          </button>
          <button type="button" onClick={share} className="flex h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-white">
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        {post.category === "prayer_request" ? (
          <button
            type="button"
            onClick={() => onPray(post.id)}
            aria-pressed={post.prayedByMe}
            className={cn(
              "mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold",
              post.prayedByMe ? "bg-white text-black" : "bg-[#EAB308] text-black"
            )}
          >
            <HandHeart className="h-4 w-4" />
            {post.prayedByMe ? `Prayed · ${post.prayerCount}` : `I Prayed for This · ${post.prayerCount}`}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function MusicPill({
  title,
  artist,
  playing,
  canPlay,
  onToggle,
}: {
  title: string;
  artist: string;
  playing: boolean;
  canPlay: boolean;
  onToggle: () => void;
}) {
  const label = `${title} · ${artist}`;
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/75 py-1.5 pl-1.5 pr-2 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canPlay}
        aria-label={playing ? "Pause track" : "Play track"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-black disabled:opacity-40"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <span className={cn("music-eq flex h-4 items-end gap-[2px]", playing && "is-playing")} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className={cn("music-marquee-track", !playing && "[animation-play-state:paused]")}>
          <span className="pr-8 text-xs font-semibold text-white">{label}</span>
          <span className="pr-8 text-xs font-semibold text-white" aria-hidden>
            {label}
          </span>
        </div>
      </div>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-500 to-black ring-2 ring-[#EAB308]",
          playing && "animate-spin [animation-duration:3s]"
        )}
        aria-hidden
      >
        <span className="h-2 w-2 rounded-full bg-[#EAB308]" />
      </span>
    </div>
  );
}
