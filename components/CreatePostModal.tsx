"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MapPin, Music2, Pause, Play, Search, UserPlus, X } from "lucide-react";
import { buildSnippet, extractVideoSound } from "@/lib/audio/snippet";
import { feelings, filterPlaces, filterTracks } from "@/lib/create/catalog";
import { createCommunityPost } from "@/lib/feed/api";
import type { CreateCategory } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MediaCarousel, type CarouselSlide } from "@/components/MediaCarousel";

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
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [location, setLocation] = useState("");
  const [activity, setActivity] = useState<Activity>("");
  const [programName, setProgramName] = useState("");
  const [feeling, setFeeling] = useState<(typeof feelings)[number]>("Grateful");
  const [firstName, setFirstName] = useState("Someone");
  const [friendQuery, setFriendQuery] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [tagged, setTagged] = useState<Friend[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);

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
    previewRef.current?.pause();
    if (!previewUrl) {
      setDuration(0);
      return;
    }
    const probe = new Audio(previewUrl);
    const onMeta = () => setDuration(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.addEventListener("loadedmetadata", onMeta);
    return () => probe.removeEventListener("loadedmetadata", onMeta);
  }, [previewUrl]);

  const matches = filterTracks(soundQuery);
  const placeMatches = filterPlaces(location);
  const videoFile = files.find((file) => file.type.startsWith("video")) ?? null;
  const trimMax = Math.max(0, duration - 15);

  function togglePreview() {
    const player = previewRef.current;
    if (!player) return;
    if (player.paused) {
      player.currentTime = trimStart;
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

  function checkInLine() {
    if (activity === "birthday") return `${firstName} is celebrating a birthday`;
    if (activity === "testimony") return `${firstName} shared a testimony`;
    if (activity === "church" && programName.trim()) return `${firstName} is at ${programName.trim()}`;
    if (activity === "feeling") return `${firstName} is feeling ${feeling}`;
    return "";
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
    if (source) {
      try {
        snippet = await buildSnippet(source, trimStart);
      } catch (trimError) {
        setPending(false);
        setError(trimError instanceof Error ? trimError.message : "The 15-second snippet could not be prepared.");
        return;
      }
    }

    const activityLine = checkInLine();
    const place = location.trim();
    const result = await createCommunityPost({
      category,
      content,
      tags,
      files,
      audio: snippet,
      songTitle,
      songArtist,
      audioUrl: snippet ? null : presetUrl || null,
      location: [place, activityLine].filter(Boolean).join(" · "),
      taggedUserIds: tagged.map((friend) => friend.id),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message || "The post could not be shared.");
      return;
    }
    router.push("/feed");
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

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={4}
          maxLength={2000}
          aria-label="Post"
          placeholder="Add a text"
          className="mt-4 w-full resize-none rounded-3xl border border-white/10 bg-black px-4 py-4 text-sm leading-6 text-white outline-none ring-[#EAB308] focus:ring-2"
        />

        <div className="mt-4">
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
          <ul className="mt-2 max-h-40 overflow-y-auto">
            {matches.map((track) => (
              <li key={`${track.artist}-${track.title}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSongTitle(track.title);
                    setSongArtist(track.artist);
                    setPresetUrl(track.url);
                    setAudio(null);
                    setSoundQuery("");
                  }}
                  className={cn("flex w-full items-center justify-between py-2 text-left text-sm", songTitle === track.title && songArtist === track.artist ? "text-[#EAB308]" : "text-white")}
                >
                  <span>
                    {track.title}
                    <span className="block text-xs text-zinc-400">{track.artist}</span>
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? <li className="py-2 text-sm text-zinc-500">No matching sound.</li> : null}
          </ul>
          <label className="mt-2 flex h-11 cursor-pointer items-center rounded-full border border-white/10 px-4 text-sm text-zinc-400">
            <span className="truncate">{audio ? audio.name : "Upload an MP3, WAV, or M4A"}</span>
            <input
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setAudio(next);
                if (next) setPresetUrl("");
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
                  const extracted = await extractVideoSound(videoFile, trimStart);
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
          {previewUrl ? (
            <div className="mt-3">
              <div className="flex items-center gap-3 rounded-full bg-[#121212] px-2 py-2">
                <button type="button" onClick={togglePreview} aria-label={previewing ? "Pause preview" : "Play preview"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-black">
                  {previewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <p className="min-w-0 flex-1 truncate text-sm text-white">
                  {songTitle || "Preview"} {songArtist ? `· ${songArtist}` : ""}
                </p>
                <audio
                  ref={previewRef}
                  src={previewUrl}
                  preload="metadata"
                  onTimeUpdate={() => {
                    const player = previewRef.current;
                    if (player && player.currentTime > trimStart + 15) {
                      player.pause();
                      setPreviewing(false);
                    }
                  }}
                  onEnded={() => setPreviewing(false)}
                  className="hidden"
                />
              </div>
              <label className="mt-3 block text-xs text-zinc-400">
                15-second snippet starts at {Math.floor(trimStart)}s
                <input
                  type="range"
                  min={0}
                  max={trimMax || 0}
                  step={0.1}
                  value={Math.min(trimStart, trimMax || 0)}
                  aria-label="Trim sound"
                  onChange={(event) => setTrimStart(Number(event.target.value))}
                  className="mt-2 w-full accent-[#EAB308]"
                />
              </label>
            </div>
          ) : songTitle ? (
            <p className="mt-3 text-xs text-zinc-400">Upload the track, or extract it from a video, to play a 15-second snippet.</p>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-[#EAB308]" />
            Location
          </p>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Search a place"
            aria-label="Location"
            className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
          />
          {location.trim() && placeMatches.length > 0 ? (
            <ul className="mt-2 rounded-2xl bg-black">
              {placeMatches.map((place) => (
                <li key={place}>
                  <button type="button" onClick={() => setLocation(place)} className="w-full px-4 py-2 text-left text-sm">
                    {place}
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

        <button type="submit" disabled={pending} className="mt-4 flex h-12 items-center justify-center rounded-full bg-[#EAB308] text-sm font-semibold text-black disabled:opacity-60">
          {pending ? "Sharing..." : "Share with the community"}
        </button>
      </form>
    </div>
  );
}
