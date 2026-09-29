"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { destinationForUser } from "@/lib/auth/destination";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const AUTH_EMAIL_KEY = "fobc-auth-email";
const AUTH_INTENT_KEY = "fobc-auth-intent";

const fieldClass =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none ring-[#F59E0B] transition focus:border-[#F59E0B] focus:bg-white focus:ring-2";

function normalizePhone(input: string) {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^6\d{8}$/.test(compact)) return `+237${compact}`;
  return `+${compact.replace(/^\+/, "")}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
    const origin = window.location.origin;
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

      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
          data: {
            full_name: name,
            ...(phoneNumber ? { phone_number: phoneNumber } : {}),
          },
        },
      });

      setPending(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      sessionStorage.setItem(AUTH_EMAIL_KEY, cleanEmail);
      sessionStorage.setItem(AUTH_INTENT_KEY, "signup");
      router.push(`/verify?email=${encodeURIComponent(cleanEmail)}`);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError || !data.user) {
      setPending(false);
      setError(signInError?.message ?? "Could not sign in.");
      return;
    }

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
          ? "Join the Festival of Blessings Community with your email."
          : "Sign in with the email and password for your account."
      }
    >
      <div className="mb-6 grid grid-cols-2 rounded-full bg-slate-100 p-1">
        {(["signin", "signup"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={mode === tab}
            onClick={() => switchMode(tab)}
            className={`h-11 rounded-full text-sm font-semibold transition ${
              mode === tab ? "bg-[#0F172A] text-white" : "text-slate-500"
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
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
            <span className="mt-2 block text-xs text-slate-500">
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
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#0F172A] text-base font-semibold text-white transition hover:bg-[#1e293b] disabled:opacity-60"
        >
          {pending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </motion.form>
    </AuthShell>
  );
}
