import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { destinationForUser } from "@/lib/auth/destination";
import { getSiteUrl } from "@/lib/site";
import { getSupabaseEnv } from "@/lib/supabase/env";

const allowedPaths = new Set(["/feed", "/onboarding", "/create", "/profile", "/prayer"]);

function safeNext(value: string | null) {
  if (!value) return null;
  const path = value.split("?")[0];
  return allowedPaths.has(path) ? path : null;
}

function redirectOrigin(requestOrigin: string) {
  if (!requestOrigin || /localhost|127\.0\.0\.1/i.test(requestOrigin)) return getSiteUrl();
  return requestOrigin.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const site = redirectOrigin(origin);
  const code = searchParams.get("code");
  const requested = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${site}/login`);
  }

  const { url, key, isConfigured } = getSupabaseEnv();
  if (!isConfigured) {
    return NextResponse.redirect(`${site}/login`);
  }

  const cookieStore = cookies();
  const storedCookies: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[] = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          storedCookies.push({ name, value, options });
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${site}/login`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = "/feed";
  try {
    destination = requested ?? (user ? await destinationForUser(supabase, user, null) : "/feed");
  } catch {
    destination = "/feed";
  }

  const redirectResponse = NextResponse.redirect(`${site}${destination}`);
  storedCookies.forEach(({ name, value, options }) => {
    redirectResponse.cookies.set(name, value, options);
  });

  return redirectResponse;
}
