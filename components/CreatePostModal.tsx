"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MapPin, Music2, Pause, Play, UserPlus, X } from "lucide-react";
import { createCommunityPost } from "@/lib/feed/api";
import type { CreateCategory } from "@/lib/feed/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const mediaTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
const audioTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/aac", "audio/x-m4a"];
const audioExtensions = ["mp3", "wav", "m4a"];
const tracks = [
  { title: "Amazing Grace", artist: "Kevin MacLeod", url: "/music/amazing-grace.mp3" },
  { title: "Agnus Dei", artist: "Kevin MacLeod", url: "/music/agnus-dei.mp3" },
  { title: "Thaxted", artist: "Kevin MacLeod", url: "/music/thaxted.mp3" },
];
const places = ["Convention grounds", "Douala", "Yaoundé", "Cameroon"];
const pills: { label: string; category: CreateCategory; tag: string }[] = [
  { label: "#Testimony", category: "testimony", tag: "Testimony" },
  { label: "#PrayerRequest", category: "prayer_request", tag: "PrayerRequest" },
  { label: "#Blessing", category: "general", tag: "Blessing" },
];

type Friend = { id: string; full_name: string | null };

export function CreatePostModal() {
  const router = useRouter();
  const [category, setCategory] = useState<CreateCategory>("testimony");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>(["Testimony"]);
  const [file, setFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [presetUrl, setPresetUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [location, setLocation] = useState("");
  const [friendQuery, setFriendQuery] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [tagged, setTagged] = useState<Friend[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
    previewRef.current?.pause();
  }, [previewUrl]);

  function togglePreview() {
    const player = previewRef.current;
    if (!player) return;
    if (player.paused) {
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (content.trim().length < 2) {
      setError("Write a few words before sharing.");
      return;
    }
    if (file && !mediaTypes.includes(file.type)) {
      setError("Use a JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV file.");
      return;
    }
    if (audio) {
      const extension = audio.name.split(".").pop()?.toLowerCase() ?? "";
      if (!audioExtensions.includes(extension) && audio.type && !audioTypes.includes(audio.type)) {
        setError("Use an MP3, WAV, or M4A audio file.");
        return;
      }
    }
    if ((file && file.size > 50 * 1024 * 1024) || (audio && audio.size > 20 * 1024 * 1024)) {
      setError("Media must be under 50 MB and audio under 20 MB.");
      return;
    }

    setPending(true);
    const result = await createCommunityPost({
      category,
      content,
      tags,
      file,
      audio,
      songTitle,
      songArtist,
      audioUrl: audio ? null : presetUrl || null,
      location,
      taggedUserIds: tagged.map((friend) => friend.id),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/feed");
    router.refresh();
  }

  return (
    <div className="fixed inset-y-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 flex-col bg-black/70">
      <form onSubmit={onSubmit} className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[2rem] bg-[#121212] px-5 pb-28 pt-4 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EAB308]">Share</p>
            <h1 className="text-2xl font-semibold">New post</h1>
          </div>
          <button type="button" onClick={() => router.push("/feed")} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
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
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-xs font-semibold",
                tags.includes(pill.tag) ? "bg-[#EAB308] text-black" : "bg-black text-zinc-300"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          maxLength={2000}
          aria-label="Post"
          placeholder="Share a testimony, a prayer request, or a blessing."
          className="mt-4 w-full resize-none rounded-3xl border border-white/10 bg-black px-4 py-4 text-sm leading-6 text-white outline-none ring-[#EAB308] focus:ring-2"
        />

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/20 bg-black px-4 py-8 text-sm text-zinc-300">
          <ImagePlus className="h-6 w-6 text-[#EAB308]" />
          <span className="max-w-full truncate">{file ? file.name : "Drop a photo or video, or tap to upload"}</span>
          <input
            type="file"
            accept={mediaTypes.join(",")}
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-4 rounded-3xl bg-black p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Music2 className="h-4 w-4 text-[#EAB308]" />
            Music
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tracks.map((track) => (
              <button
                key={track.title}
                type="button"
                onClick={() => {
                  setSongTitle(track.title);
                  setSongArtist(track.artist);
                  setPresetUrl(track.url);
                  setAudio(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  presetUrl === track.url && !audio ? "bg-[#EAB308] text-black" : "bg-[#121212] text-zinc-300"
                )}
              >
                {track.title}
              </button>
            ))}
          </div>
          <input
            value={songTitle}
            onChange={(event) => setSongTitle(event.target.value)}
            placeholder="Song title"
            aria-label="Song title"
            className="mt-3 h-11 w-full rounded-full border border-white/10 bg-[#121212] px-4 text-sm outline-none"
          />
          <input
            value={songArtist}
            onChange={(event) => setSongArtist(event.target.value)}
            placeholder="Artist"
            aria-label="Song artist"
            className="mt-2 h-11 w-full rounded-full border border-white/10 bg-[#121212] px-4 text-sm outline-none"
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
                if (next) setPresetUrl("");
              }}
            />
          </label>
          {previewUrl ? (
            <div className="mt-3 flex items-center gap-3 rounded-full bg-[#121212] px-2 py-2">
              <button
                type="button"
                onClick={togglePreview}
                aria-label={previewing ? "Pause preview" : "Play preview"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-black"
              >
                {previewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <p className="min-w-0 flex-1 truncate text-sm text-white">
                {songTitle || "Preview"} {songArtist ? `· ${songArtist}` : ""}
              </p>
              <audio ref={previewRef} src={previewUrl} preload="none" onEnded={() => setPreviewing(false)} className="hidden" />
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-[#EAB308]" />
            Location
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {places.map((place) => (
              <button
                key={place}
                type="button"
                onClick={() => setLocation(place)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", location === place ? "bg-[#EAB308] text-black" : "bg-black text-zinc-300")}
              >
                {place}
              </button>
            ))}
          </div>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Check in"
            aria-label="Location"
            className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black px-4 text-sm outline-none"
          />
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
