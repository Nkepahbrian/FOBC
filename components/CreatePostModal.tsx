"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, MapPin, Music2, Pause, Play, Search, UserPlus, X } from "lucide-react";
import { buildSnippet, extractVideoSound } from "@/lib/audio/snippet";
import { feelings, filterPlaces, filterTracks } from "@/lib/create/catalog";

type PlaceHit = { label: string; value: string };
type ClipLength = 15 | 25;
import { createCommunityPost } from "@/lib/feed/api";
import type { CreateCategory, FeedPost } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MediaCarousel, type CarouselSlide } from "@/components/MediaCarousel";
import { StylePalette } from "@/components/StylePalette";
import { ThoughtCard } from "@/components/ThoughtCard";
import { cardStyleById } from "@/lib/styles/cards";

const mediaTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
const audioTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/aac", "audio/x-m4a"];
const audioExtensions = ["mp3", "wav", "m4a"];
const pills: { label: string; category: CreateCategory; tag: string }[] = [
  { label: "#Testimony", category: "testimony", tag: "Testimony" },
  { label: "#PrayerRequest", category: "prayer_request", tag: "PrayerRequest" },
  { label: "#Blessing", category: "general", tag: "Blessing" },
];

type Friend = { id: string; full_name: string | null };
type Activity = "" | "birthday" | "testimony" | "church" | "feeling";

export function CreatePostModal() {
  const router = useRouter();
  const [category, setCategory] = useState<CreateCategory>("testimony");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>(["Testimony"]);
  const [files, setFiles] = useState<File[]>([]);
  const [audio, setAudio] = useState<File | null>(null);
  const [presetUrl, setPresetUrl] = useState("");
  const [soundQuery, setSoundQuery] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [clipLength, setClipLength] = useState<ClipLength>(15);
  const [appliedStart, setAppliedStart] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [remotePlaces, setRemotePlaces] = useState<PlaceHit[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [toast, setToast] = useState(false);
  const [listPreviewId, setListPreviewId] = useState("");
  const [catalog, setCatalog] = useState(() => filterTracks("").filter((track) => track.url));
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const listPreviewRef = useRef<HTMLAudioElement | null>(null);
  const autoplayRef = useRef(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [location, setLocation] = useState("");
  const [activity, setActivity] = useState<Activity>("");
  const [programName, setProgramName] = useState("");
  const [feeling, setFeeling] = useState<(typeof feelings)[number]>("Grateful");
  const [firstName, setFirstName] = useState("Someone");
  const [accountId, setAccountId] = useState("");
  const [friendQuery, setFriendQuery] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [tagged, setTagged] = useState<Friend[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [thoughtStyle, setThoughtStyle] = useState<string | null>(null);

  useEffect(() => {
    const next = files.map((file) => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith("video") ? ("video" as const) : ("image" as const),
    }));
    setSlides(next);
    return () => next.forEach((slide) => URL.revokeObjectURL(slide.url));
  }, [files]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setAccountId(data.user.id);
      const profile = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      const name = profile.data?.full_name?.trim().split(" ")[0];
      if (name) setFirstName(name);
    });
  }, []);

  useEffect(() => {
    const trimmed = friendQuery.trim().replace(/[%_]/g, "");
    if (!trimmed) {
      setFriends([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id, full_name").ilike("full_name", `%${trimmed}%`).limit(6);
      setFriends((data ?? []) as Friend[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [friendQuery]);

  useEffect(() => {
    if (!audio) {
      setPreviewUrl(presetUrl);
      return;
    }
    const url = URL.createObjectURL(audio);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio, presetUrl]);

  useEffect(() => {
    setPreviewing(false);
    setTrimStart(0);
    setAppliedStart(null);
    previewRef.current?.pause();
    if (!previewUrl) {
      setDuration(0);
      setPeaks([]);
      return;
    }
    const probe = new Audio(previewUrl);
    const onMeta = () => setDuration(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.addEventListener("loadedmetadata", onMeta);
    const player = previewRef.current;
    if (player && autoplayRef.current) {
      player.src = previewUrl;
      player.currentTime = 0;
      player.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false));
      autoplayRef.current = false;
    }
    let cancelled = false;
    const context = new AudioContext();
    fetch(previewUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => context.decodeAudioData(buffer))
      .then((buffer) => {
        if (cancelled) return;
        const raw = buffer.getChannelData(0);
        const bars = 42;
        const size = Math.max(1, Math.floor(raw.length / bars));
        const next = Array.from({ length: bars }, (_, index) => {
          let max = 0;
          for (let sample = 0; sample < size; sample += 48) max = Math.max(max, Math.abs(raw[index * size + sample] || 0));
          return max;
        });
        const peak = Math.max(...next, 0.01);
        setPeaks(next.map((value) => value / peak));
      })
      .catch(() => {
        if (!cancelled) setPeaks([]);
      })
      .finally(() => {
        context.close().catch(() => undefined);
      });
    return () => {
      cancelled = true;
      probe.removeEventListener("loadedmetadata", onMeta);
    };
  }, [previewUrl]);

  useEffect(() => {
    const query = location.trim();
    if (!suggesting || query.length < 2) {
      setRemotePlaces([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const rows = (await response.json()) as { display_name?: string }[];
        const hits = rows
          .map((row) => {
            const label = row.display_name?.trim() || "";
            const value = label.split(",")[0]?.trim() || "";
            return label && value ? { label, value } : null;
          })
          .filter((hit): hit is PlaceHit => Boolean(hit));
        setRemotePlaces(hits);
      } catch {
        if (!controller.signal.aborted) setRemotePlaces([]);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [location, suggesting]);

  useEffect(() => {
    const query = soundQuery.trim();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/music?q=${encodeURIComponent(query)}`);
        const rows = response.ok ? ((await response.json()) as { title: string; artist: string; url: string }[]) : [];
        const local = filterTracks(query).filter((track) => track.url);
        const merged = [...local];
        for (const row of rows) {
          if (!row.url) continue;
          if (!merged.some((item) => item.title === row.title && item.artist === row.artist)) merged.push(row);
        }
        setCatalog(merged);
      } catch {
        setCatalog(filterTracks(query).filter((track) => track.url));
      }
    }, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [soundQuery]);
  const localPlaces = filterPlaces(location).map((place) => ({ label: place, value: place }));
  const placeMatches = [
    ...localPlaces,
    ...remotePlaces.filter((place) => !localPlaces.some((local) => local.value.toLowerCase() === place.value.toLowerCase())),
  ];
  const videoFile = files.find((file) => file.type.startsWith("video")) ?? null;
  const trimMax = Math.max(0, duration - clipLength);

  function togglePreview() {
    const player = previewRef.current;
    if (!player) return;
    if (player.paused) {
      player.currentTime = appliedStart ?? trimStart;
      player.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false));
    } else {
      player.pause();
      setPreviewing(false);
    }
  }

  function choosePill(pill: (typeof pills)[number]) {
    setCategory(pill.category);
    setTags([pill.tag]);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((file) => mediaTypes.includes(file.type) || file.type.startsWith("image/") || file.type.startsWith("video/"));
    setFiles((current) => [...current, ...next].slice(0, 10));
  }

  function eventLabel(program: string) {
    return /^the\s/i.test(program) ? program : `the ${program}`;
  }

  function checkInLine() {
    const place = location.trim();
    const program = programName.trim();
    if (place && activity === "church" && program) return `${firstName} is in ${place} at ${eventLabel(program)}`;
    if (place && activity === "birthday") return `${firstName} is in ${place} celebrating a birthday`;
    if (place && activity === "testimony") return `${firstName} is in ${place} sharing a testimony`;
    if (place && activity === "feeling") return `${firstName} is in ${place} feeling ${feeling}`;
    if (place) return `${firstName} is in ${place}`;
    if (activity === "church" && program) return `${firstName} is at ${eventLabel(program)}`;
    if (activity === "birthday") return `${firstName} is celebrating a birthday`;
    if (activity === "testimony") return `${firstName} shared a testimony`;
    if (activity === "feeling") return `${firstName} is feeling ${feeling}`;
    return "";
  }

  function applySnippet() {
    const start = Math.min(trimStart, trimMax);
    setAppliedStart(start);
    const player = previewRef.current;
    if (!player) return;
    player.currentTime = start;
    player.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (content.trim().length < 2) {
      setError("Write a few words before sharing.");
      return;
    }
    if (files.some((file) => file.size > 50 * 1024 * 1024) || (audio && audio.size > 20 * 1024 * 1024)) {
      setError("Each photo or video must be under 50 MB and audio under 20 MB.");
      return;
    }
    if (audio) {
      const extension = audio.name.split(".").pop()?.toLowerCase() ?? "";
      if (!audioExtensions.includes(extension) && !audio.type.startsWith("audio") && !audioTypes.includes(audio.type)) {
        setError("Use an MP3, WAV, or M4A audio file.");
        return;
      }
    }

    setPending(true);
    let snippet = audio;
    const source = audio || presetUrl;
    const snippetStart = appliedStart ?? Math.min(trimStart, trimMax);
    if (source) {
      try {
        snippet = await buildSnippet(source, snippetStart, clipLength);
      } catch (trimError) {
        if (!presetUrl) {
          setPending(false);
          setError(trimError instanceof Error ? trimError.message : "The audio snippet could not be prepared.");
          return;
        }
        snippet = null;
      }
    }

    const result = await createCommunityPost({
      category,
      content,
      tags,
      files: thoughtStyle ? [] : files,
      audio: snippet,
      songTitle,
      songArtist,
      audioUrl: snippet ? null : presetUrl || null,
      location: checkInLine(),
      taggedUserIds: tagged.map((friend) => friend.id),
      songSnippetStart: source ? snippetStart : null,
      songSnippetLength: clipLength,
      thoughtStyle,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message || "The post could not be shared.");
      return;
    }
    const optimistic: FeedPost = {
      id: result.id || `local-${Date.now()}`,
      userId: accountId,
      fullName: firstName,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      category,
      content: content.trim(),
      mediaUrl: result.imageUrl,
      mediaType: result.imageUrl ? (files.some((file) => file.type.startsWith("video")) ? "video" : "image") : result.audioUrl ? "audio" : null,
      imageUrl: result.imageUrl,
      imageUrls: result.imageUrls,
      tags,
      amenCount: 0,
      commentCount: 0,
      prayerCount: 0,
      likedByMe: false,
      prayedByMe: false,
      source: "live",
      pinned: false,
      featured: false,
      location: checkInLine() || null,
      songTitle: songTitle || null,
      songArtist: songArtist || null,
      songUrl: result.audioUrl,
      audioUrl: result.audioUrl,
      songSnippetStart: snippetStart,
      songSnippetLength: clipLength,
      thoughtStyle,
    };
    window.sessionStorage.setItem("fobc-optimistic-post", JSON.stringify(optimistic));
    window.sessionStorage.setItem("fobc-just-shared", result.id || "latest");
    window.dispatchEvent(new Event("fobc-post-shared"));
    setToast(true);
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    router.push(`/feed?shared=${Date.now()}`);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-30 mx-auto flex h-dvh w-full max-w-lg flex-col bg-black/70">
      <form onSubmit={onSubmit} className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[2rem] bg-[#121212] px-5 pb-28 pt-4 text-white shadow-2xl">
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
          <span />
          <h1 className="text-center text-base font-semibold">New post</h1>
          <button type="button" onClick={() => router.push("/feed")} aria-label="Close" className="flex h-10 w-10 items-center justify-center justify-self-end rounded-full bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto">
          {pills.map((pill) => (
            <button
              key={pill.label}
              type="button"
              aria-pressed={tags.includes(pill.tag)}
              onClick={() => choosePill(pill)}
              className={cn("h-9 shrink-0 rounded-full px-3 text-xs font-semibold", tags.includes(pill.tag) ? "bg-[#EAB308] text-black" : "bg-black text-zinc-300")}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={Boolean(thoughtStyle)}
          onClick={() => setThoughtStyle((current) => (current ? null : "red"))}
          className={cn("mt-4 h-10 rounded-full px-4 text-sm font-semibold", thoughtStyle ? "bg-[#EAB308] text-black" : "bg-black text-white")}
        >
          Post a Thought
        </button>

        {thoughtStyle ? (
          <div className="mt-4">
            <ThoughtCard styleId={thoughtStyle} className="min-h-[320px]">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                maxLength={280}
                aria-label="Thought"
                placeholder="What's on your mind?"
                className="w-full resize-none bg-transparent text-center text-3xl font-bold leading-tight outline-none placeholder:text-current placeholder:opacity-60"
                style={{ color: cardStyleById(thoughtStyle).color }}
              />
            </ThoughtCard>
            <div className="mt-3">
              <StylePalette value={thoughtStyle} onChange={setThoughtStyle} />
            </div>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              const field = event.currentTarget;
              field.style.height = "180px";
              field.style.height = `${Math.max(180, field.scrollHeight)}px`;
            }}
            rows={6}
            maxLength={2000}
            aria-label="Post"
            placeholder="Add a message"
            className="mt-4 min-h-[180px] w-full resize-y rounded-3xl border border-white/10 bg-black px-4 py-4 text-sm leading-6 text-white outline-none ring-[#EAB308] focus:ring-2"
          />
        )}

        <div className={cn("mt-4", thoughtStyle && "hidden")}>
          {slides.length > 0 ? <MediaCarousel slides={slides} /> : null}
          <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 bg-black text-sm text-zinc-300", slides.length === 0 ? "aspect-[4/5] rounded-3xl border border-dashed border-white/20" : "mt-3 h-12 rounded-full border border-white/10")}>
            <ImagePlus className="h-6 w-6 text-[#EAB308]" />
            <span>{slides.length > 0 ? "Add more photos or videos" : "Tap to open your gallery or camera"}</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="mt-4 rounded-3xl bg-black p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Music2 className="h-4 w-4 text-[#EAB308]" />
            Add Sound
          </p>
          <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-white/10 bg-[#121212] px-4">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              value={soundQuery}
              onChange={(event) => setSoundQuery(event.target.value)}
              placeholder="Search gospel and worship"
              aria-label="Search sound"
              className="h-full w-full bg-transparent text-sm outline-none"
            />
          </label>
          <ul className="mt-2 max-h-52 overflow-y-auto">
            {catalog.map((track) => {
              const trackId = `${track.artist}-${track.title}`;
              const selected = songTitle === track.title && songArtist === track.artist;
              return (
                <li key={trackId} className="flex items-center gap-2 border-b border-white/5 py-1">
                  <button
                    type="button"
                    aria-label={listPreviewId === trackId ? `Pause ${track.title}` : `Preview ${track.title}`}
                    disabled={!track.url}
                    onClick={() => {
                      const player = listPreviewRef.current;
                      if (!player || !track.url) return;
                      if (listPreviewId === trackId) {
                        player.pause();
                        setListPreviewId("");
                        return;
                      }
                      player.src = track.url;
                      player.muted = false;
                      player.play().then(() => setListPreviewId(trackId)).catch(() => setListPreviewId(""));
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-black disabled:opacity-30"
                  >
                    {listPreviewId === trackId ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSongTitle(track.title);
                      setSongArtist(track.artist);
                      setPresetUrl(track.url);
                      setAudio(null);
                      setSoundQuery("");
                      autoplayRef.current = Boolean(track.url);
                    }}
                    className={cn("min-w-0 flex-1 py-1 text-left text-sm", selected ? "text-[#EAB308]" : "text-white")}
                  >
                    <span className="block truncate">{track.title}</span>
                    <span className="block truncate text-xs text-zinc-400">{track.artist}</span>
                  </button>
                </li>
              );
            })}
            {catalog.length === 0 ? <li className="py-2 text-sm text-zinc-500">No matching sound.</li> : null}
          </ul>
          <audio
            ref={listPreviewRef}
            preload="none"
            muted={false}
            onEnded={() => setListPreviewId("")}
            className="hidden"
          />
          <label className="mt-2 flex h-11 cursor-pointer items-center rounded-full border border-white/10 px-4 text-sm text-zinc-400">
            <span className="truncate">{audio ? audio.name : "Upload an MP3, WAV, or M4A"}</span>
            <input
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setAudio(next);
                if (next) {
                  setPresetUrl("");
                  autoplayRef.current = true;
                }
              }}
            />
          </label>
          {videoFile ? (
            <button
              type="button"
              disabled={extracting}
              onClick={async () => {
                setExtracting(true);
                setError("");
                try {
                  const extracted = await extractVideoSound(videoFile, appliedStart ?? trimStart, clipLength);
                  setAudio(extracted);
                  setPresetUrl("");
                  if (!songTitle) {
                    setSongTitle("Original audio");
                    setSongArtist(firstName);
                  }
                } catch (extractError) {
                  setError(extractError instanceof Error ? extractError.message : "The video sound could not be extracted.");
                } finally {
                  setExtracting(false);
                }
              }}
              className="mt-2 h-11 w-full rounded-full bg-[#121212] text-sm font-semibold text-[#EAB308] disabled:opacity-60"
            >
              {extracting ? "Extracting sound..." : "Extract sound from video"}
            </button>
          ) : null}
          <audio
            ref={previewRef}
            src={previewUrl || undefined}
            preload="auto"
            onTimeUpdate={() => {
              const player = previewRef.current;
              if (!player || appliedStart === null) return;
              const end = appliedStart + clipLength;
              if (player.currentTime >= end || player.currentTime < appliedStart) player.currentTime = appliedStart;
            }}
            onEnded={() => {
              const player = previewRef.current;
              if (player && appliedStart !== null) {
                player.currentTime = appliedStart;
                player.play().catch(() => setPreviewing(false));
                return;
              }
              setPreviewing(false);
            }}
            className="hidden"
          />
          {previewUrl ? (
            <div className="mt-3">
              <div className="flex items-center gap-3 rounded-full bg-[#121212] px-2 py-2">
                <button type="button" onClick={togglePreview} aria-label={previewing ? "Pause preview" : "Play preview"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-black">
                  {previewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <p className="min-w-0 flex-1 truncate text-sm text-white">
                  {songTitle || "Preview"} {songArtist ? `· ${songArtist}` : ""}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                {([15, 25] as const).map((length) => (
                  <button
                    key={length}
                    type="button"
                    aria-pressed={clipLength === length}
                    onClick={() => {
                      setClipLength(length);
                      setTrimStart((current) => Math.min(current, Math.max(0, duration - length)));
                    }}
                    className={cn("h-8 rounded-full px-3 text-xs font-semibold", clipLength === length ? "bg-[#EAB308] text-black" : "bg-[#121212] text-zinc-300")}
                  >
                    {length}s
                  </button>
                ))}
              </div>
              <div className="relative mt-3 h-12">
                <div className="flex h-full items-end gap-px" aria-hidden="true">
                  {(peaks.length > 0 ? peaks : Array.from({ length: 42 }, () => 0.35)).map((peak, index, all) => {
                    const second = duration > 0 ? (index / all.length) * duration : 0;
                    const active = duration > 0 && second >= trimStart && second <= trimStart + clipLength;
                    return <span key={index} className={cn("flex-1 rounded-sm", active ? "bg-[#EAB308]" : "bg-white/25")} style={{ height: `${Math.max(12, peak * 100)}%` }} />;
                  })}
                </div>
                <input
                  type="range"
                  min={0}
                  max={trimMax || 0}
                  step={0.1}
                  value={Math.min(trimStart, trimMax || 0)}
                  aria-label="Trim sound"
                  onChange={(event) => setTrimStart(Number(event.target.value))}
                  className="absolute inset-0 w-full cursor-pointer opacity-0"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">
                  {clipLength}s snippet starts at {Math.floor(trimStart)}s
                  {appliedStart !== null ? ` · looping from ${Math.floor(appliedStart)}s` : ""}
                </p>
                <button type="button" onClick={applySnippet} className="h-8 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-black">
                  Apply
                </button>
              </div>
            </div>
          ) : songTitle ? (
            <p className="mt-3 text-xs text-zinc-400">Upload the track, or extract it from a video, to play a snippet.</p>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-[#EAB308]" />
            Location
          </p>
          <input
            value={location}
            onChange={(event) => {
              setSuggesting(true);
              setLocation(event.target.value);
            }}
            placeholder="Search a place"
            aria-label="Location"
            className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
          />
          {suggesting && location.trim().length >= 2 && placeMatches.length > 0 ? (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-2xl bg-black">
              {placeMatches.map((place) => (
                <li key={`${place.value}-${place.label}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setLocation(place.value);
                      setSuggesting(false);
                      setRemotePlaces([]);
                    }}
                    className="w-full px-4 py-2 text-left text-sm"
                  >
                    <span className="block">{place.value}</span>
                    {place.label !== place.value ? <span className="block truncate text-xs text-zinc-500">{place.label}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="mt-3 block text-sm font-semibold">
            Activity
            <select
              value={activity}
              aria-label="Activity"
              onChange={(event) => setActivity(event.target.value as Activity)}
              className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
            >
              <option value="">None</option>
              <option value="birthday">Birthday</option>
              <option value="testimony">Testimony</option>
              <option value="church">Church Program</option>
              <option value="feeling">Feelings / Status</option>
            </select>
          </label>
          {activity === "church" ? (
            <input
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              placeholder="Festival of Blessings"
              aria-label="Church program"
              className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
            />
          ) : null}
          {activity === "feeling" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {feelings.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFeeling(item)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", feeling === item ? "bg-[#EAB308] text-black" : "bg-black text-zinc-300")}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {checkInLine() ? <p className="mt-2 text-xs text-[#EAB308]">{checkInLine()}</p> : null}
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-[#EAB308]" />
            Tag friends
          </p>
          <input
            value={friendQuery}
            onChange={(event) => setFriendQuery(event.target.value)}
            placeholder="Search profiles"
            aria-label="Tag friends"
            className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
          />
          {friends.length > 0 ? (
            <ul className="mt-2">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTagged((current) => (current.some((item) => item.id === friend.id) ? current : [...current, friend]));
                      setFriendQuery("");
                      setFriends([]);
                    }}
                    className="w-full py-2 text-left text-sm"
                  >
                    {friend.full_name || "Community member"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {tagged.length > 0 ? <p className="mt-2 text-xs text-[#EAB308]">{tagged.map((friend) => friend.full_name || "Member").join(", ")}</p> : null}
        </div>

        {error ? <p role="alert" className="mt-3 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-300">{error}</p> : null}

        <button type="submit" disabled={pending} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#EAB308] text-sm font-semibold text-black disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Sharing..." : "Share with the community"}
        </button>
        {toast ? (
          <p role="status" className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-[#EAB308] px-4 py-2 text-sm font-semibold text-black shadow-lg">
            Shared successfully!
          </p>
        ) : null}
      </form>
    </div>
  );
}
