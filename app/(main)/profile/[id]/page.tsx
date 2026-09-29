import { ProfileScreen } from "@/components/ProfileScreen";

export default function MemberProfilePage({ params }: { params: { id: string } }) {
  return <ProfileScreen userId={params.id} isOwn={false} />;
}
