import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const SESSION_KEY = "fobc-auth-session";

export function persistAuthSession(session: Pick<Session, "access_token" | "refresh_token"> | null) {
  if (typeof window === "undefined") return;
  if (!session?.access_token || !session.refresh_token) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
  );
}

export async function restoreAuthSession() {
  if (typeof window === "undefined" || !getSupabaseEnv().isConfigured) return false;
  const supabase = createClient();
  const current = await supabase.auth.getSession();
  if (current.data.session) {
    persistAuthSession(current.data.session);
    return true;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
    if (!saved.access_token || !saved.refresh_token) {
      window.localStorage.removeItem(SESSION_KEY);
      return false;
    }
    const restored = await supabase.auth.setSession({
      access_token: saved.access_token,
      refresh_token: saved.refresh_token,
    });
    if (restored.error || !restored.data.session) {
      window.localStorage.removeItem(SESSION_KEY);
      return false;
    }
    persistAuthSession(restored.data.session);
    return true;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return false;
  }
}
