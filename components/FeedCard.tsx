"use client";

import Link from "next/link";
import { Heart, MapPin, MessageCircle, MoreHorizontal, Music, Share2, HandHeart, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdelphoiButton } from "@/components/AdelphoiButton";
import { MediaCarousel, type CarouselSlide } from "@/components/MediaCarousel";
import { MediaLightbox } from "@/components/MediaLightbox";
import { ThoughtCard } from "@/components/ThoughtCard";
import { isSoundOn, setSoundOn } from "@/lib/audio/sound";
import type { FeedPost } from "@/lib/feed/types";
import { categoryLabel, formatTimestamp } from "@/lib/feed/types";
import { notifyRecipient } from "@/lib/notifications/store";
import { cn } from "@/lib/utils";

type FeedCardProps = {
  post: FeedPost;
  viewerId?: string | null;
  commentsOpen: boolean;
  onToggleComments: (postId: string) => void;
  onAmen: (postId: string) => void;
  onPray: (postId: string) => void;
  onSaveEdit: (postId: string, content: string) => Promise<string | null>;
  onDelete: (postId: string) => Promise<string | null>;
  onHide: (postId: string) => void;
  onReport: (postId: string) => Promise<string | null>;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function FeedCard({
  post,
  viewerId,
  commentsOpen,
  onToggleComments,
  onAmen,
  onPray,
  onSaveEdit,
  onDelete,
  onHide,
  onReport,
}: FeedCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const visibleRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [soundOn, setSound] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reported, setReported] = useState(false);
  const mine = Boolean(viewerId && viewerId === post.userId);
  const profileHref = `/profile/${post.userId}`;
  const audioSrc = post.audioUrl || post.songUrl;
  const showMusic = Boolean(audioSrc || post.songTitle);
  const slides = mediaSlides(post);
  const hasVideo = slides.some((slide) => slide.type === "video");
  const showSpeaker = Boolean(audioSrc || hasVideo);

  async function share() {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    const text = `${post.fullName} on FOBC: ${post.content}`;
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: "FOBC", text, url });
        shared = true;
      } catch {
        return;
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
      shared = true;
    }
    if (shared && viewerId && viewerId !== post.userId) {
      await notifyRecipient({
        recipientId: post.userId,
        kind: "share",
        body: "Shared your post.",
        href: `/post/${post.id}?from=notifications`,
      });
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  useEffect(() => {
    function onOther(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (id === post.id) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.muted = true;
      }
    }
    window.addEventListener("fobc-audio", onOther);
    return () => window.removeEventListener("fobc-audio", onOther);
  }, [post.id]);

  const applyPlayback = useCallback((visible: boolean, unlocked: boolean) => {
    const node = cardRef.current;
    node?.querySelectorAll<HTMLVideoElement>("video[data-inline]").forEach((video) => {
      video.muted = Boolean(audioSrc) || !unlocked;
      if (visible && lightbox === null) video.play().catch(() => undefined);
      else video.pause();
    });
    const audio = audioRef.current;
    if (!audio) return;
    if (visible && unlocked) {
      const start = post.songSnippetStart || 0;
      window.dispatchEvent(new CustomEvent("fobc-audio", { detail: post.id }));
      if (audio.currentTime < start || (post.songSnippetLength > 0 && audio.currentTime >= start + post.songSnippetLength)) {
        audio.currentTime = start;
      }
      audio.muted = false;
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
      audio.muted = true;
    }
  }, [audioSrc, lightbox, post.id, post.songSnippetLength, post.songSnippetStart]);

  function toggleSound() {
    const next = !isSoundOn();
    setSoundOn(next);
    setSound(next);
    applyPlayback(visibleRef.current, next);
  }

  useEffect(() => {
    setSound(isSoundOn());
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        visibleRef.current = visible;
        applyPlayback(visible, isSoundOn());
      },
      { threshold: [0.5] }
    );
    observer.observe(node);
    function onSound(event: Event) {
      const unlocked = Boolean((event as CustomEvent<boolean>).detail);
      setSound(unlocked);
      applyPlayback(visibleRef.current, unlocked);
    }
    window.addEventListener("fobc-sound", onSound);
    return () => {
      observer.disconnect();
      window.removeEventListener("fobc-sound", onSound);
    };
  }, [applyPlayback]);

  const speaker = showSpeaker ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleSound();
      }}
      aria-label={soundOn ? "Mute" : "Unmute"}
      aria-pressed={!soundOn}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
    >
      {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  ) : null;

  return (
    <article ref={cardRef} id={`post-${post.id}`} className="border-b border-white/10 bg-black pb-3">
      <header className="relative px-4 py-3">
        <div className="flex items-start gap-2.5">
        <Link href={profileHref} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#EAB308] to-[#FDE68A] p-[2px]" aria-label={post.fullName}>
          {post.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.avatarUrl} alt="" loading="lazy" className="h-full w-full rounded-full border border-black object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full border border-black bg-[#121212] text-[11px] font-semibold leading-none text-[#EAB308]">
              {initials(post.fullName)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link href={profileHref} className="m-0 block min-w-0 p-0">
                <h3 className="m-0 truncate p-0 text-sm font-semibold leading-[1.2] text-white">{post.fullName}</h3>
              </Link>
              <AdelphoiButton userId={post.userId} name={post.fullName} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <time className="text-xs text-zinc-500" dateTime={post.createdAt}>
                {formatTimestamp(post.createdAt)}
              </time>
              <div ref={menuRef}>
                <button
                  type="button"
                  aria-label="Post options"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menuOpen ? (
                  <div className="absolute right-4 top-12 z-20 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#121212] py-1 shadow-2xl">
                    {mine ? (
                      <>
                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setDraft(post.content);
                            setEditing(true);
                            setMenuOpen(false);
                            setActionError("");
                          }}
                        >
                          Edit Post
                        </button>
                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/10"
                          onClick={() => {
                            setConfirmDelete(true);
                            setMenuOpen(false);
                          }}
                        >
                          Delete Post
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                          onClick={async () => {
                            setMenuOpen(false);
                            const message = await onReport(post.id);
                            if (message) setActionError(message);
                            else setReported(true);
                          }}
                        >
                          Report Post
                        </button>
                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMenuOpen(false);
                            onHide(post.id);
                          }}
                        >
                          Hide Post
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
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
          {showMusic ? (
            <p className="m-0 mt-0.5 flex min-w-0 items-center gap-1 p-0 text-xs leading-[1.2] text-white">
              <Music className="h-3 w-3 shrink-0 text-[#EAB308]" />
              <span className="truncate">
                {post.songArtist || "FOBC"} • {post.songTitle || "Worship"}
              </span>
            </p>
          ) : null}
        </div>
        </div>
      </header>

      {post.thoughtStyle && slides.length === 0 ? (
        <ThoughtCard text={post.content} styleId={post.thoughtStyle} className="mx-4" />
      ) : null}
      {slides.length > 0 ? (
        <MediaCarousel slides={slides} muted={Boolean(audioSrc) || !soundOn} onOpen={setLightbox} corner={speaker} />
      ) : null}

      <div className="px-4">
        {editing ? (
          <form
            className="mt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setActionError("");
              const message = await onSaveEdit(post.id, draft);
              setBusy(false);
              if (message) {
                setActionError(message);
                return;
              }
              setEditing(false);
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Edit post"
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-[#EAB308]"
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={busy} className="h-9 rounded-full bg-[#EAB308] px-4 text-sm font-semibold text-black disabled:opacity-60">
                {busy ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(post.content);
                  setActionError("");
                }}
                className="h-9 rounded-full bg-white/10 px-4 text-sm font-semibold text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : post.content && !post.thoughtStyle ? (
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-white">{post.content}</p>
        ) : null}
        {reported ? <p className="mt-2 text-xs text-[#EAB308]">Thanks. This post was reported.</p> : null}
        {actionError ? <p className="mt-2 text-xs text-red-300">{actionError}</p> : null}

        {showSpeaker && slides.length === 0 ? <div className="relative mt-3 h-12">{speaker ? <div className="absolute bottom-0 right-0">{speaker}</div> : null}</div> : null}
        {audioSrc ? (
          <audio
            ref={audioRef}
            src={audioSrc}
            loop
            preload="none"
            muted
            onEnded={() => {
              const audio = audioRef.current;
              if (!audio || !isSoundOn()) return;
              audio.currentTime = post.songSnippetStart || 0;
              audio.muted = false;
              audio.play().catch(() => undefined);
            }}
            onTimeUpdate={() => {
              const audio = audioRef.current;
              if (!audio || !post.songSnippetLength) return;
              const start = post.songSnippetStart || 0;
              if (audio.currentTime >= start + post.songSnippetLength) audio.currentTime = start;
            }}
            className="hidden"
          />
        ) : null}

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
      {lightbox !== null && slides[lightbox] ? (
        <MediaLightbox slide={slides[lightbox]} muted={Boolean(audioSrc) || !soundOn} onClose={() => setLightbox(null)} corner={speaker} />
      ) : null}
      {confirmDelete ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Delete post" className="w-full max-w-lg rounded-t-3xl bg-[#121212] p-5 text-white sm:rounded-3xl">
            <h2 className="text-lg font-semibold">Delete this post?</h2>
            <p className="mt-2 text-sm text-zinc-400">This removes it from the community feed.</p>
            {actionError ? <p className="mt-2 text-sm text-red-300">{actionError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setActionError("");
                  const message = await onDelete(post.id);
                  setBusy(false);
                  if (message) setActionError(message);
                }}
                className="h-11 flex-1 rounded-full bg-red-500 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Deleting..." : "Delete Post"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 flex-1 rounded-full bg-white/10 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function displayImages(post: FeedPost) {
  return post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
}

function mediaSlides(post: FeedPost): CarouselSlide[] {
  return displayImages(post).map((url) => ({
    url,
    type: /\.(mp4|webm|mov)(\?|$)/i.test(url) || (post.mediaType === "video" && displayImages(post).length === 1) ? "video" : "image",
  }));
}

