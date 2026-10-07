import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/push/key";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

type SubscriptionRow = { endpoint?: string; p256dh?: string; auth?: string };

export async function POST(request: Request) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return Response.json({ ok: false, error: "Push is not configured." }, { status: 503 });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { url, key, isConfigured } = getSupabaseEnv();
  if (!token || !isConfigured) return Response.json({ ok: false }, { status: 401 });

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return Response.json({ ok: false }, { status: 401 });

  const payload = (await request.json()) as {
    subscriptions?: SubscriptionRow[];
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
  const subscriptions = (payload.subscriptions ?? []).filter((item) => item.endpoint && item.p256dh && item.auth).slice(0, 8);
  if (subscriptions.length === 0) return Response.json({ ok: true, sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:nkepahbrian@gmail.com", VAPID_PUBLIC_KEY, privateKey);
  const message = JSON.stringify({
    title: String(payload.title || "FOBC").slice(0, 120),
    body: String(payload.body || "Open FOBC").slice(0, 180),
    url: String(payload.url || "/notifications").slice(0, 300),
    tag: String(payload.tag || "fobc").slice(0, 80),
  });

  const results = await Promise.all(
    subscriptions.map(async (item) => {
      try {
        await webpush.sendNotification(
          { endpoint: item.endpoint as string, keys: { p256dh: item.p256dh as string, auth: item.auth as string } },
          message,
          { urgency: "high", TTL: 60 * 60 }
        );
        return true;
      } catch (sendError) {
        console.error("Phone alert failed:", sendError);
        return false;
      }
    })
  );

  return Response.json({ ok: true, sent: results.filter(Boolean).length });
}
