import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let profile: { full_name: string | null; bio: string | null; avatar_url: string | null } | null = null;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, bio, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  } catch {
    profile = null;
  }

  const name = profile?.full_name || "Your profile";

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">You</p>
      <div className="mt-4 flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0F172A] text-lg font-semibold text-[#FBBF24]">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A]">{name}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        {profile?.bio || "Add a photo and a short bio so the community knows who is sharing."}
      </p>
      <div className="mt-6 flex flex-col gap-3 text-sm font-semibold">
        <Link href="/feed" className="text-[#0F172A]">
          Open feed
        </Link>
        <Link href="/prayer" className="text-[#0F172A]">
          Prayer wall
        </Link>
        <Link href="/create" className="text-[#0F172A]">
          Share a post
        </Link>
        <Link href="/onboarding" className="text-[#B45309]">
          Edit profile
        </Link>
      </div>
    </section>
  );
}
