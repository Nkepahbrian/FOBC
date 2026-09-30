const DEFAULT_SNIPPET_SECONDS = 15;

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function sliceAudioBuffer(context: AudioContext, buffer: AudioBuffer, startSeconds: number, durationSeconds: number) {
  const rate = buffer.sampleRate;
  const start = Math.min(buffer.length - 1, Math.max(0, Math.floor(startSeconds * rate)));
  const length = Math.max(1, Math.min(buffer.length - start, Math.floor(durationSeconds * rate)));
  const next = context.createBuffer(buffer.numberOfChannels, length, rate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    next.getChannelData(channel).set(buffer.getChannelData(channel).subarray(start, start + length));
  }
  return next;
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = samples * blockAlign;
  const array = new ArrayBuffer(44 + dataSize);
  const view = new DataView(array);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let sample = 0; sample < samples; sample += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channelData[channel][sample] || 0));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }
  return new File([array], "fobc-snippet.wav", { type: "audio/wav" });
}

async function decodeSource(context: AudioContext, source: File | string) {
  if (typeof source === "string") {
    const response = await fetch(source);
    return context.decodeAudioData(await response.arrayBuffer());
  }
  return context.decodeAudioData(await source.arrayBuffer());
}

async function captureVideoSound(file: File, startSeconds: number, durationSeconds: number) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This video's sound could not be read."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : startSeconds + durationSeconds;
    video.currentTime = Math.min(Math.max(0, startSeconds), Math.max(0, duration - 0.25));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!capture) throw new Error("This browser cannot extract sound from that video.");
    const stream = capture.call(video);
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) throw new Error("That video has no sound track.");
    const recorder = new MediaRecorder(new MediaStream(audioTracks));
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    });
    await video.play();
    recorder.start();
    await new Promise((resolve) => window.setTimeout(resolve, durationSeconds * 1000));
    recorder.stop();
    video.pause();
    const blob = await stopped;
    const type = blob.type || "audio/webm";
    return new File([blob], type.includes("mp4") ? "fobc-snippet.m4a" : "fobc-snippet.webm", { type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildSnippet(source: File | string, startSeconds: number, durationSeconds = DEFAULT_SNIPPET_SECONDS) {
  const context = new AudioContext();
  const length = durationSeconds === 25 ? 25 : 15;
  try {
    const decoded = await decodeSource(context, source);
    return audioBufferToWav(sliceAudioBuffer(context, decoded, startSeconds, length));
  } catch (error) {
    if (typeof source !== "string" && source.type.startsWith("video")) {
      return captureVideoSound(source, startSeconds, length);
    }
    throw error instanceof Error ? error : new Error("The sound could not be trimmed.");
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function extractVideoSound(file: File, startSeconds: number, durationSeconds = DEFAULT_SNIPPET_SECONDS) {
  const length = durationSeconds === 25 ? 25 : 15;
  try {
    return await buildSnippet(file, startSeconds, length);
  } catch {
    return captureVideoSound(file, startSeconds, length);
  }
}
