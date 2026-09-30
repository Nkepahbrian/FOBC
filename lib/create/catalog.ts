export type SoundTrack = {
  title: string;
  artist: string;
  url: string;
};

export const soundLibrary: SoundTrack[] = [
  { title: "Amazing Grace", artist: "Kevin MacLeod", url: "/music/amazing-grace.mp3" },
  { title: "Agnus Dei", artist: "Kevin MacLeod", url: "/music/agnus-dei.mp3" },
  { title: "Thaxted", artist: "Kevin MacLeod", url: "/music/thaxted.mp3" },
  { title: "Way Maker", artist: "Sinach", url: "" },
  { title: "I Know Who I Am", artist: "Sinach", url: "" },
  { title: "Imela", artist: "Nathaniel Bassey", url: "" },
  { title: "Onise Iyanu", artist: "Nathaniel Bassey", url: "" },
  { title: "Ko S'obi", artist: "Dunsin Oyekan", url: "" },
  { title: "Fragrance to Fire", artist: "Dunsin Oyekan", url: "" },
  { title: "Too Faithful", artist: "Moses Bliss", url: "" },
  { title: "Bigger Everyday", artist: "Moses Bliss", url: "" },
  { title: "Altar", artist: "Victoria Orenze", url: "" },
  { title: "Goodness of God", artist: "Kari Jobe", url: "" },
  { title: "The Blessing", artist: "Kari Jobe", url: "" },
  { title: "What a Beautiful Name", artist: "Hillsong Worship", url: "" },
  { title: "Oceans", artist: "Hillsong Worship", url: "" },
  { title: "Who You Say I Am", artist: "Hillsong Worship", url: "" },
  { title: "Kaleo", artist: "Kaleo Worship", url: "" },
];

export const placeSuggestions = [
  "Festival of Blessings",
  "Convention grounds",
  "Gospel of Christ Ministries",
  "Douala",
  "Yaoundé",
  "Buea",
  "Limbe",
  "Bamenda",
  "Bafoussam",
  "Garoua",
  "Maroua",
  "Kribi",
  "Cameroon",
  "Lagos",
  "Abuja",
  "Accra",
  "Nairobi",
  "London",
  "Paris",
  "Houston",
];

export const feelings = ["Grateful", "Blessed", "Worshipping"] as const;

export function filterTracks(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return soundLibrary;
  return soundLibrary.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(needle));
}

export function filterPlaces(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return placeSuggestions.slice(0, 6);
  return placeSuggestions.filter((place) => place.toLowerCase().includes(needle)).slice(0, 6);
}
