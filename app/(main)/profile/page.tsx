import { redirect } from "next/navigation";
import { ProfileScreen } from "@/components/ProfileScreen";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ProfileScreen userId={user.id} isOwn />;
}
