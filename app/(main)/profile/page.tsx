import Link from "next/link";

export default function ProfilePage() {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">You</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]">Profile</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Your name, photo, and bio are saved during onboarding.
      </p>
      <Link href="/onboarding" className="mt-6 inline-flex text-sm font-semibold text-[#B45309]">
        Edit profile
      </Link>
    </section>
  );
}
