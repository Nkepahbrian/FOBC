"use client";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type PhoneAlert = {
  recipientId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function playAlertSound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/fobc-chime.wav");
  audio.volume = 0.9;
  const pending = audio.play();
  pending.catch(() => undefined);
}

export async function deliverPhoneAlert(input: PhoneAlert) {
  if (!input.recipientId || !getSupabaseEnv().isConfigured) return;
  try {
    const supabase = createClient();
    const subs = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", input.recipientId);
    if (subs.error || (subs.data ?? []).length === 0) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await fetch("/api/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        subscriptions: subs.data,
        title: input.title,
        body: input.body,
        url: input.url,
        tag: input.tag,
      }),
    });
  } catch (error) {
    console.error("Could not send the phone alert:", error);
  }
}
