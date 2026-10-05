"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AuthShell } from "@/components/AuthShell";
import { destinationForUser } from "@/lib/auth/destination";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const AUTH_EMAIL_KEY = "fobc-auth-email";
const AUTH_NAME_KEY = "fobc-auth-name";
const AUTH_PHONE_KEY = "fobc-auth-phone";
const AUTH_PASSWORD_KEY = "fobc-auth-password";
const CODE_LENGTH = 6;

export default function VerifyOtpPage() {
  const router = useRouter();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, () => ""));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const configured = getSupabaseEnv().isConfigured;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextEmail = params.get("email") || sessionStorage.getItem(AUTH_EMAIL_KEY) || "";
    if (nextEmail) {
      sessionStorage.setItem(AUTH_EMAIL_KEY, nextEmail);
      setEmail(nextEmail);
    }
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function applyCode(value: string, startIndex = 0) {
    const chars = value.replace(/\D/g, "").slice(0, CODE_LENGTH - startIndex).split("");
    if (chars.length === 0) return;
    const next = [...digits];
    chars.forEach((char, offset) => {
      next[startIndex + offset] = char;
    });
    setDigits(next);
    const focusIndex = Math.min(startIndex + chars.length, CODE_LENGTH - 1);
    inputs.current[focusIndex]?.focus();
  }

  function onChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      applyCode(clean, index);
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (key === "ArrowRight" && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onPaste(text: string) {
    const clean = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!clean) return;
    const next = Array.from({ length: CODE_LENGTH }, (_, index) => clean[index] ?? "");
    setDigits(next);
    inputs.current[Math.min(clean.length, CODE_LENGTH) - 1]?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = digits.join("");
    if (!email) {
      setError("Go back and enter the email you used to create the account.");
      return;
    }
    if (token.length !== CODE_LENGTH) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (!configured) {
      setError("Supabase is not configured yet.");
      return;
    }

    setPending(true);
    setError("");
    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (verifyError || !data.user) {
      setPending(false);
      setError(verifyError?.message ?? "That code could not be verified.");
      return;
    }

    const pendingName = sessionStorage.getItem(AUTH_NAME_KEY)?.trim() ?? "";
    const pendingPhone = sessionStorage.getItem(AUTH_PHONE_KEY)?.trim() ?? "";
    const pendingPassword = sessionStorage.getItem(AUTH_PASSWORD_KEY) ?? "";
    let user = data.user;

    if (pendingName || pendingPhone || pendingPassword) {
      const { data: updated } = await supabase.auth.updateUser({
        ...(pendingPassword ? { password: pendingPassword } : {}),
        data: {
          ...(pendingName ? { full_name: pendingName } : {}),
          ...(pendingPhone ? { phone_number: pendingPhone } : {}),
        },
      });
      if (updated.user) user = updated.user;
    }

    try {
      await destinationForUser(supabase, user, "signup");
    } catch {
      /* profile details can be finished from the feed */
    }

    sessionStorage.removeItem(AUTH_EMAIL_KEY);
    sessionStorage.removeItem(AUTH_NAME_KEY);
    sessionStorage.removeItem(AUTH_PHONE_KEY);
    sessionStorage.removeItem(AUTH_PASSWORD_KEY);
    router.replace("/feed");
    router.refresh();
  }

  async function resend() {
    if (!email || !configured || cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.signInWithOtp({
      email,
    });
    setResending(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setCooldown(60);
    setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
    inputs.current[0]?.focus();
  }

  return (
    <AuthShell title="Enter your code" subtitle="We sent a 6-digit code to your email. Enter it here to open the community.">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onSubmit={onSubmit}
        className="space-y-6"
      >
        {email ? <p className="text-sm text-zinc-300">{email}</p> : null}
        <div>
          <p className="text-sm font-medium" id="otp-label">
            6-digit code
          </p>
          <div
            role="group"
            aria-labelledby="otp-label"
            className="mt-3 flex justify-between gap-2"
            onPaste={(event) => {
              event.preventDefault();
              onPaste(event.clipboardData.getData("text"));
            }}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                value={digit}
                onChange={(event) => onChange(index, event.target.value)}
                onKeyDown={(event) => onKeyDown(index, event.key)}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${index + 1}`}
                maxLength={index === 0 ? CODE_LENGTH : 1}
                className="h-14 w-12 rounded-2xl border border-white/10 bg-black text-center text-2xl font-semibold text-white outline-none ring-[#EAB308] focus:border-[#EAB308] focus:ring-2"
              />
            ))}
          </div>
        </div>

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
          {pending ? "Verifying..." : "Verify code"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={resending || cooldown > 0 || !email}
          className="w-full text-sm font-medium text-[#EAB308] disabled:opacity-60"
        >
          {resending ? "Sending code..." : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>

        <Link href="/login?mode=signup" className="block text-center text-sm text-zinc-400">
          Use a different email
        </Link>
      </motion.form>
    </AuthShell>
  );
}
