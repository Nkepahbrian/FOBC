import { PostScreen } from "@/components/PostScreen";

export default function PostPage({ params }: { params: { id: string } }) {
  return <PostScreen postId={params.id} />;
}
