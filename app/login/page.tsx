"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { destinationForUser } from "@/lib/auth/destination";
import { persistAuthSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const AUTH_INTENT_KEY = "fobc-auth-intent";

const fieldClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white outline-none ring-[#EAB308] transition placeholder:text-zinc-500 focus:border-[#EAB308] focus:ring-2";

function normalizePhone(input: string) {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^6\d{8}$/.test(compact)) return `+237${compact}`;
  return `+${compact.replace(/^\+/, "")}`;
}

function shouldRescueExistingAccount(message: string) {
  return /user already registered|already been registered|invalid login credentials/i.test(message);
}

function emailNotConfirmed(message: string | undefined) {
  return Boolean(message && /email not confirmed|not confirmed|confirm your email/i.test(message));
}

const DEFAULT_BIO = "Add a short bio so the community knows your story.";

async function ensureProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  phoneNumber: string
) {
  const existing = await supabase.from("profiles").select("bio").eq("id", userId).maybeSingle();
  const bio = existing.data?.bio?.trim() ? existing.data.bio : DEFAULT_BIO;
  const saved = await supabase.from("profiles").upsert(
    { id: userId, full_name: name, bio },
    { onConflict: "id" }
  );
  if (saved.error) {
    const updated = await supabase.from("profiles").update({ full_name: name, bio }).eq("id", userId);
    if (updated.error) console.error("Could not save profile:", updated.error);
  }

  if (phoneNumber) {
    const phone = await supabase.from("profiles").update({ phone_number: phoneNumber }).eq("id", userId);
    if (phone.error) console.error("Could not save phone number:", phone.error);
  }

  const metadata = await supabase.auth.updateUser({
    data: {
      full_name: name,
      ...(phoneNumber ? { phone_number: phoneNumber } : {}),
    },
  });
  if (metadata.error) console.error("Could not update account display name:", metadata.error);
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
  }, []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const configured = getSupabaseEnv().isConfigured;

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError("");
    setShowPassword(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Use a password with at least 6 characters.");
      return;
    }

    if (!configured) {
      setError("Supabase is not configured yet.");
      return;
    }

    const supabase = createClient();
    setPending(true);

    if (mode === "signup") {
      const name = fullName.trim();
      if (name.length < 2) {
        setPending(false);
        setError("Enter your full name.");
        return;
      }

      const phoneNumber = normalizePhone(phone);
      if (phoneNumber && !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
        setPending(false);
        setError("Enter a valid phone number, or leave it blank.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: name,
            ...(phoneNumber ? { phone_number: phoneNumber } : {}),
          },
        },
      });

      const existingAccount =
        Boolean(signUpError && shouldRescueExistingAccount(signUpError.message)) ||
        Boolean(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (signUpError && !existingAccount && !emailNotConfirmed(signUpError.message)) {
        setPending(false);
        setError(signUpError.message);
        return;
      }

      let signedIn = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      let user = signedIn.data.user ?? data.user;
      let session = signedIn.data.session;

      const invalidPassword = Boolean(
        signedIn.error && /invalid login credentials|invalid credentials/i.test(signedIn.error.message) && !emailNotConfirmed(signedIn.error.message)
      );

      if (!session && !invalidPassword) {
        const activated = await fetch("/api/auth/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            userId: data.user?.id ?? "",
            fullName: name,
            phoneNumber,
          }),
        });
        if (activated.ok) {
          signedIn = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          user = signedIn.data.user ?? user;
          session = signedIn.data.session;
          if (!session) {
            const tokens = (await activated.json()) as { access_token?: string; refresh_token?: string };
            if (tokens.access_token && tokens.refresh_token) {
              const restored = await supabase.auth.setSession({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
              });
              user = restored.data.user ?? user;
              session = restored.data.session;
            }
          }
        }
      }

      if (!session && data.session) {
        const restored = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        user = restored.data.user ?? data.user ?? user;
        session = restored.data.session ?? data.session;
      }

      if (session && user) {
        try {
          await ensureProfile(supabase, user.id, name, phoneNumber);
        } catch (profileError) {
          console.error("Could not save profile:", profileError);
        }
        persistAuthSession(session);
        router.replace("/feed");
        router.refresh();
        return;
      }

      setPending(false);
      setError(signedIn.error?.message ?? signUpError?.message ?? "Could not sign in.");
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError || !data.user || !data.session) {
      setPending(false);
      setError(signInError?.message ?? "Could not sign in.");
      return;
    }

    persistAuthSession(data.session);
    sessionStorage.setItem(AUTH_INTENT_KEY, "signin");
    const destination = await destinationForUser(supabase, data.user, "signin");
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    router.push(destination);
    router.refresh();
  }

  return (
    <AuthShell
      title={mode === "signup" ? "Create account" : "Welcome back"}
      subtitle={
        mode === "signup"
          ? "Create your account and go straight into the community."
          : "Sign in with the email and password for your account."
      }
    >
      <div className="mb-6 grid grid-cols-2 rounded-full bg-black p-1">
        {(["signin", "signup"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={mode === tab}
            onClick={() => switchMode(tab)}
            className={`h-11 rounded-full text-sm font-semibold transition ${
              mode === tab ? "bg-[#EAB308] text-black" : "text-zinc-500"
            }`}
          >
            {tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        ))}
      </div>

      <motion.form
        key={mode}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onSubmit={onSubmit}
        className="space-y-4"
      >
        {mode === "signup" ? (
          <label className="block">
            <span className="text-sm font-medium">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              className={fieldClass}
              required
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium">Email address</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <span className="relative mt-2 block">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${fieldClass} mt-0 pr-12`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </span>
        </label>

        {mode === "signup" ? (
          <label className="block">
            <span className="text-sm font-medium">Phone number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Optional"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={fieldClass}
            />
            <span className="mt-2 block text-xs text-zinc-500">
              Optional. Saved on your profile for contact details.
            </span>
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#EAB308] text-base font-semibold text-black transition hover:bg-[#FACC15] disabled:opacity-60"
        >
          {pending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </motion.form>
    </AuthShell>
  );
}
