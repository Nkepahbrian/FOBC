import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let profile: { id: string; full_name: string | null; bio: string | null; avatar_url: string | null } | null = null;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, bio, avatar_url")
      .eq("id", params.id)
      .maybeSingle();
    profile = data;
  } catch {
    profile = null;
  }

  const name = profile?.full_name || "Community member";

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">Member</p>
      <div className="mt-4 flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0F172A] text-lg font-semibold text-[#FBBF24]">
            {initials(name) || "F"}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight text-[#0F172A]">{name}</h1>
          <p className="text-sm text-slate-500">{profile ? "FOBC member" : "Profile unavailable"}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        {profile?.bio || "This member has not added a bio yet."}
      </p>
      <Link href="/search" className="mt-6 inline-block text-sm font-semibold text-[#B45309]">
        Back to search
      </Link>
    </section>
  );
}
