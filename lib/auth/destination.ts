import type { SupabaseClient, User } from "@supabase/supabase-js";

const DEFAULT_BIO = "Add a short bio so the community knows your story.";

function metadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function destinationForUser(
  supabase: SupabaseClient,
  user: User,
  intent: string | null
) {
  const fullName = metadataText(user, "full_name");
  const phoneNumber = metadataText(user, "phone_number");

  try {
    const existing = await supabase.from("profiles").select("bio").eq("id", user.id).maybeSingle();
    const bio = existing.data?.bio?.trim() ? existing.data.bio : DEFAULT_BIO;
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        ...(fullName ? { full_name: fullName } : {}),
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        bio,
      },
      { onConflict: "id" }
    );
  } catch {
    return "/feed";
  }

  if (intent === "signup") return "/onboarding";

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return "/feed";
    return profile?.full_name ? "/feed" : "/onboarding";
  } catch {
    return "/feed";
  }
}
