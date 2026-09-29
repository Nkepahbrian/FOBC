import { FeedScreen } from "@/components/FeedScreen";

export default function FeedPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  return <FeedScreen initialTab={searchParams.tab === "prayer" ? "prayer" : "feed"} />;
}
