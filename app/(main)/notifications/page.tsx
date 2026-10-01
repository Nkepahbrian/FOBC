import Link from "next/link";
import { NotificationsPanel } from "@/components/NotificationsPanel";

export default function NotificationsPage() {
  return (
    <section className="text-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-black/90 px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/feed" className="text-sm font-semibold text-[#EAB308]">
          Feed
        </Link>
        <h1 className="text-lg font-semibold">Notifications</h1>
      </header>
      <NotificationsPanel />
    </section>
  );
}
