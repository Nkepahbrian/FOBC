export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  return {
    url,
    key,
    isConfigured: Boolean(url && key),
  };
}
