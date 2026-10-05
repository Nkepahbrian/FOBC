const storageKey = "fobc-sound";
const audioExtensions = ["mp3", "m4a", "wav"] as const;

let sharedContext: AudioContext | null = null;

export function isSoundOn() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(storageKey) === "1";
}

export function setSoundOn(on: boolean) {
  window.sessionStorage.setItem(storageKey, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("fobc-sound", { detail: on }));
}

export function unlockAudioContext() {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!sharedContext) sharedContext = new Ctx();
  if (sharedContext.state === "suspended") {
    sharedContext.resume().catch((error) => console.error("Audio context resume failed:", error));
  }
}

export function audioMime(url: string) {
  const extension = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  if (extension === "aac") return "audio/aac";
  if (extension === "ogg") return "audio/ogg";
  return "";
}

export function audioCandidates(url: string) {
  const [path, query] = url.split("?");
  const match = path.match(/\.([a-z0-9]+)$/i);
  const extension = match?.[1].toLowerCase() ?? "";
  if (!audioExtensions.includes(extension as (typeof audioExtensions)[number]) && extension !== "aac" && extension !== "ogg") {
    return [url];
  }
  const stem = path.replace(/\.[a-z0-9]+$/i, "");
  const ordered = [extension, ...audioExtensions.filter((item) => item !== extension)];
  return ordered.map((item) => {
    const next = `${stem}.${item}`;
    return query ? `${next}?${query}` : next;
  });
}

export function playAttachedAudio(audio: HTMLAudioElement, url: string, start = 0) {
  unlockAudioContext();
  const candidates = audioCandidates(url);
  let index = Number(audio.dataset.candidateIndex || "0");
  if (!Number.isFinite(index) || index < 0 || index >= candidates.length) index = 0;
  const nextUrl = candidates[index];
  if (audio.dataset.loadedSrc !== nextUrl) {
    audio.dataset.loadedSrc = nextUrl;
    audio.src = nextUrl;
  }
  audio.muted = false;
  audio.volume = 1;
  if (start > 0) {
    try {
      if (audio.currentTime < start) audio.currentTime = start;
    } catch {
      /* metadata may still be loading */
    }
  }
  const pending = audio.play();
  pending.catch((error) => {
    console.error("Could not play attached audio:", error);
    const blocked = error instanceof DOMException && error.name === "NotAllowedError";
    const next = index + 1;
    if (blocked || next >= candidates.length) return;
    audio.dataset.candidateIndex = String(next);
    audio.dataset.loadedSrc = candidates[next];
    audio.src = candidates[next];
    audio.muted = false;
    audio.play().catch((fallbackError) => console.error("Audio format fallback failed:", fallbackError));
  });
  return pending;
}
