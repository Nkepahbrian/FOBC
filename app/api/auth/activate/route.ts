import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

const DEFAULT_BIO = "Add a short bio so the community knows your story.";

type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

async function findAuthUser(url: string, serviceKey: string, email: string, hintedId: string) {
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  if (hintedId) {
    const byId = await fetch(`${url}/auth/v1/admin/users/${hintedId}`, { headers });
    if (byId.ok) {
      const user = (await byId.json()) as AuthUser;
      if (user.id && user.email?.toLowerCase() === email) return user;
    }
  }

  const filtered = await fetch(
    `${url}/auth/v1/admin/users?page=1&per_page=20&filter=${encodeURIComponent(email)}`,
    { headers }
  );
  if (!filtered.ok) return null;
  const body = (await filtered.json()) as { users?: AuthUser[] };
  return (body.users ?? []).find((user) => user.email?.toLowerCase() === email) ?? null;
}

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const { url, key, isConfigured } = getSupabaseEnv();
  if (!isConfigured || !serviceKey) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  let body: { email?: string; password?: string; userId?: string; fullName?: string; phoneNumber?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; userId?: string; fullName?: string; phoneNumber?: string };
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const hintedId = String(body.userId || "");
  const fullName = String(body.fullName || "").trim();
  const phoneNumber = String(body.phoneNumber || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let account = await findAuthUser(url, serviceKey, email, hintedId);
  if (!account) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      },
    });
    if (created.error || !created.data.user) {
      account = await findAuthUser(url, serviceKey, email, "");
      if (!account) return Response.json({ error: "confirm" }, { status: 400 });
    } else {
      account = {
        id: created.data.user.id,
        email: created.data.user.email,
        email_confirmed_at: created.data.user.email_confirmed_at,
      };
    }
  }

  const wasConfirmed = Boolean(account.email_confirmed_at);
  if (!wasConfirmed) {
    const confirmed = await admin.auth.admin.updateUserById(account.id, {
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      },
    });
    if (confirmed.error) return Response.json({ error: "confirm" }, { status: 400 });
  }

  const anon = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session || !signed.data.user) {
    if (!wasConfirmed) await admin.auth.admin.updateUserById(account.id, { email_confirm: false });
    return Response.json({ error: "credentials" }, { status: 401 });
  }

  const userId = signed.data.user.id;
  const existing = await admin.from("profiles").select("bio").eq("id", userId).maybeSingle();
  const bio = existing.data?.bio?.trim() ? existing.data.bio : DEFAULT_BIO;
  const profile = {
    id: userId,
    ...(fullName ? { full_name: fullName } : {}),
    bio,
    ...(phoneNumber ? { phone_number: phoneNumber } : {}),
  };
  const saved = await admin.from("profiles").upsert(profile, { onConflict: "id" });
  if (saved.error && phoneNumber) {
    await admin.from("profiles").upsert(
      { id: userId, ...(fullName ? { full_name: fullName } : {}), bio },
      { onConflict: "id" }
    );
  }

  return Response.json({
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
  });
}
