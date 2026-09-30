import { FeedScreen } from "@/components/FeedScreen";

export default function FeedPage({
  searchParams,
}: {
  searchParams: { tab?: string; shared?: string };
}) {
  return <FeedScreen key={searchParams.shared ?? "feed"} initialTab={searchParams.tab === "prayer" ? "prayer" : "feed"} />;
}
