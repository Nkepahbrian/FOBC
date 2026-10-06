import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const { url, key, isConfigured } = getSupabaseEnv();
  if (!isConfigured || !serviceKey) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  let body: { email?: string; password?: string; userId?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; userId?: string };
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const userId = String(body.userId || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || !userId) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const confirmed = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (confirmed.error) return Response.json({ error: "confirm" }, { status: 400 });

  const anon = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    await admin.auth.admin.updateUserById(userId, { email_confirm: false });
    return Response.json({ error: "credentials" }, { status: 401 });
  }

  return Response.json({
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
  });
}
