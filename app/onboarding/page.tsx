"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function OnboardingPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const configured = getSupabaseEnv().isConfigured;
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, bio, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();

      setFullName(profile?.full_name ?? "");
      setBio(profile?.bio ?? "");
      setPreview(profile?.avatar_url ?? "");
      setReady(true);
    });
  }, [configured, router]);

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = fullName.trim();
    if (name.length < 2) {
      setError("Enter the name people should see on your profile.");
      return;
    }

    if (!configured) {
      setError("Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local before saving your profile.");
      return;
    }

    if (file && !acceptedTypes.includes(file.type)) {
      setError("Use a JPG, PNG, WEBP, or GIF photo.");
      return;
    }

    if (file && file.size > 5 * 1024 * 1024) {
      setError("Choose a photo smaller than 5 MB.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPending(false);
      router.replace("/login");
      return;
    }

    let avatarUrl: string | null = null;

    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

      if (uploadError) {
        setPending(false);
        setError(uploadError.message);
        return;
      }

      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: saveError } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: name,
      bio: bio.trim(),
      phone_number: user.phone ?? null,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    });

    setPending(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    router.push("/feed");
    router.refresh();
  }

  return (
    <AuthShell
      title="Set up your profile"
      subtitle="Add your name, a photo, and a short bio so the community knows who is sharing."
    >
      {!ready ? (
        <p className="text-sm text-slate-500">Loading your profile...</p>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          onSubmit={onSubmit}
          className="space-y-5"
        >
          <div className="flex items-center gap-4">
            <label className="relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[#0F172A] text-white">
              {preview ? (
                // Blob and Supabase storage URLs are not known to next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Camera className="h-6 w-6" />
                </span>
              )}
              <input
                type="file"
                accept={acceptedTypes.join(",")}
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div>
              <p className="text-sm font-medium">Profile photo</p>
              <p className="mt-1 text-xs text-slate-500">Uploaded to your avatars folder. JPG, PNG, WEBP, or GIF.</p>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={80}
              autoComplete="name"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none ring-[#F59E0B] transition focus:border-[#F59E0B] focus:bg-white focus:ring-2"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Bio</span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={160}
              rows={4}
              placeholder="A short word about you and why you are here."
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none ring-[#F59E0B] transition focus:border-[#F59E0B] focus:bg-white focus:ring-2"
            />
            <span className="mt-2 block text-right text-xs text-slate-500">{bio.trim().length}/160</span>
          </label>

          {error ? (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="flex h-14 w-full items-center justify-center rounded-full bg-[#F59E0B] text-base font-semibold text-[#0F172A] transition hover:bg-[#fbbf24] disabled:opacity-60"
          >
            {pending ? "Saving..." : "Enter the community"}
          </button>
        </motion.form>
      )}
    </AuthShell>
  );
}
