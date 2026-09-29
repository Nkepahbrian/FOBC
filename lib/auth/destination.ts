import type { SupabaseClient, User } from "@supabase/supabase-js";

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

  if (fullName || phoneNumber) {
    await supabase.from("profiles").upsert({
      id: user.id,
      ...(fullName ? { full_name: fullName } : {}),
      ...(phoneNumber ? { phone_number: phoneNumber } : {}),
    });
  }

  if (intent === "signup") return "/onboarding";

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.full_name ? "/feed" : "/onboarding";
}
