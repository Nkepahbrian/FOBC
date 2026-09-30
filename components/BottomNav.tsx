"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, Plus, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/create", label: "Create", icon: Plus, accent: true },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <ul className="grid grid-cols-5 items-end">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const accent = "accent" in item && item.accent;

          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium",
                  accent ? "-mt-5" : "",
                  active ? "text-[#EAB308]" : "text-zinc-500"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center",
                    accent
                      ? "h-14 w-14 rounded-full bg-[#EAB308] text-black shadow-lg shadow-yellow-500/30"
                      : "h-6 w-6"
                  )}
                >
                  <Icon className={accent ? "h-7 w-7" : "h-5 w-5"} strokeWidth={accent ? 2.4 : 2} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
