export type CardStyle = {
  id: string;
  label: string;
  background: string;
  color: string;
};

export const cardStyles: CardStyle[] = [
  { id: "red", label: "Red", background: "#d92525", color: "#ffffff" },
  { id: "cosmic", label: "Cosmic", background: "linear-gradient(160deg, #070b1a 0%, #312e81 48%, #6d28d9 100%)", color: "#ffffff" },
  { id: "aurora", label: "Aurora", background: "linear-gradient(135deg, #042f2e 0%, #0e7490 42%, #22c55e 78%, #bef264 100%)", color: "#ffffff" },
  { id: "night", label: "Night", background: "linear-gradient(180deg, #020617 0%, #1e1b4b 62%, #4338ca 100%)", color: "#ffffff" },
  { id: "blush", label: "Blush", background: "linear-gradient(160deg, #fb7185 0%, #fda4af 42%, #fde68a 100%)", color: "#1c1917" },
  { id: "gold", label: "Gold", background: "linear-gradient(145deg, #78350f 0%, #d97706 52%, #fde68a 100%)", color: "#ffffff" },
  { id: "pink", label: "Pink", background: "linear-gradient(135deg, #ec4899 0%, #e879f9 100%)", color: "#ffffff" },
  { id: "sky", label: "Sky", background: "linear-gradient(160deg, #38bdf8 0%, #818cf8 100%)", color: "#ffffff" },
  { id: "sunset", label: "Sunset", background: "linear-gradient(135deg, #fb7185 0%, #fb923c 48%, #facc15 100%)", color: "#1c1917" },
  { id: "rose", label: "Rose", background: "linear-gradient(180deg, #9f1239 0%, #fb7185 100%)", color: "#ffffff" },
  { id: "navy", label: "Navy", background: "#0f172a", color: "#ffffff" },
  { id: "lavender", label: "Lavender", background: "linear-gradient(160deg, #c4b5fd 0%, #f5d0fe 100%)", color: "#1e1b4b" },
  { id: "mint", label: "Mint", background: "linear-gradient(160deg, #99f6e4 0%, #a7f3d0 100%)", color: "#064e3b" },
  { id: "cream", label: "Cream", background: "#fef3c7", color: "#1c1917" },
  { id: "yellow", label: "Yellow", background: "#facc15", color: "#1c1917" },
  { id: "lime", label: "Lime", background: "#84cc16", color: "#14532d" },
];

export function cardStyleById(id: string | null | undefined) {
  return cardStyles.find((style) => style.id === id) ?? cardStyles[0];
}
