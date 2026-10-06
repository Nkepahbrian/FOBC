"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { persistAuthSession, restoreAuthSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const publicAuthPaths = new Set(["/login", "/verify", "/verify-otp", "/signup"]);

export function AuthSession() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    restoreAuthSession().then((active) => {
      if (active && publicAuthPaths.has(window.location.pathname)) router.replace("/feed");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") persistAuthSession(null);
      else if (session) persistAuthSession(session);
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
