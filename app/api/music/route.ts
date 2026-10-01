import { NextRequest, NextResponse } from "next/server";

type Track = { title: string; artist: string; url: string };

const seeds = [
  "Way Maker Sinach",
  "Imela Nathaniel Bassey",
  "Onise Iyanu Nathaniel Bassey",
  "Dunsin Oyekan",
  "Moses Bliss",
  "Victoria Orenze",
  "Hillsong Worship Oceans",
  "What a Beautiful Name Hillsong",
  "Who You Say I Am Hillsong",
  "Maverick City Music",
  "Holy Culture worship",
  "Goodness of God worship",
  "Kari Jobe The Blessing",
  "Elevation Worship",
  "Bethel Music",
  "Amazing Grace",
];

const cache = new Map<string, { at: number; tracks: Track[] }>();

async function itunes(term: string, limit: number): Promise<Track[]> {
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`,
    { next: { revalidate: 3600 } }
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    results?: { trackName?: string; artistName?: string; previewUrl?: string }[];
  };
  return (body.results ?? [])
    .filter((row) => row.previewUrl && row.trackName && row.artistName)
    .map((row) => ({
      title: row.trackName as string,
      artist: row.artistName as string,
      url: row.previewUrl as string,
    }));
}

function dedupe(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = `${track.artist}|${track.title}`.toLowerCase();
    if (seen.has(key) || !track.url) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) {
    return NextResponse.json(hit.tracks);
  }

  try {
    const tracks = query
      ? await itunes(`${query} worship`, 25)
      : dedupe((await Promise.all(seeds.map((seed) => itunes(seed, 5)))).flat());
    const playable = dedupe(tracks).filter((track) => track.url.startsWith("https://"));
    cache.set(key, { at: Date.now(), tracks: playable });
    return NextResponse.json(playable);
  } catch {
    return NextResponse.json([]);
  }
}
