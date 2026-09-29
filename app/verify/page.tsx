"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const OTP_PHONE_KEY = "fobc-otp-phone";

export default function VerifyPage() {
  const router = useRouter();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [phone, setPhone] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const configured = getSupabaseEnv().isConfigured;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextPhone = params.get("phone") || sessionStorage.getItem(OTP_PHONE_KEY) || "";

    if (!nextPhone) {
      router.replace("/login");
      return;
    }

    sessionStorage.setItem(OTP_PHONE_KEY, nextPhone);
    setPhone(nextPhone);
    inputs.current[0]?.focus();
  }, [router]);

  function updateDigit(index: number, value: string) {
    const next = value.replace(/\D/g, "");
    setDigits((current) => {
      const copy = [...current];

      if (next.length > 1) {
        next
          .slice(0, 6 - index)
          .split("")
          .forEach((char, offset) => {
            copy[index + offset] = char;
          });
        return copy;
      }

      copy[index] = next;
      return copy;
    });

    if (next && index < 5) {
      inputs.current[Math.min(index + next.length, 5)]?.focus();
    }
  }

  async function verifyCode(code: string) {
    if (!configured) {
      setError("Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local before verifying a code.");
      return;
    }

    setPending(true);
    setError("");

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });

    setPending(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    sessionStorage.removeItem(OTP_PHONE_KEY);

    const userId = data.user?.id;
    let destination = "/onboarding";

    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.full_name) destination = "/feed";
    }

    router.push(destination);
    router.refresh();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = digits.join("");

    if (code.length !== 6) {
      setError("Enter the 6-digit code from your text message.");
      return;
    }

    await verifyCode(code);
  }

  async function resend() {
    if (!phone || !configured) return;

    setResending(true);
    setError("");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setResending(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setDigits(Array(6).fill(""));
    inputs.current[0]?.focus();
  }

  return (
    <AuthShell
      title="Enter your code"
      subtitle={phone ? `We sent a 6-digit code to ${phone}.` : "Confirm the code sent to your phone."}
    >
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        onSubmit={onSubmit}
        className="space-y-6"
      >
        <div className="grid grid-cols-6 gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputs.current[index] = node;
              }}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !digits[index] && index > 0) {
                  inputs.current[index - 1]?.focus();
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (!pasted) return;
                event.preventDefault();
                const next = Array(6).fill("");
                pasted.split("").forEach((char, charIndex) => {
                  next[charIndex] = char;
                });
                setDigits(next);
                inputs.current[Math.min(pasted.length, 5)]?.focus();
              }}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${index + 1} of 6`}
              maxLength={index === 0 ? 6 : 1}
              className="h-14 rounded-2xl border border-slate-200 bg-slate-50 text-center text-xl font-semibold outline-none ring-[#F59E0B] transition focus:border-[#F59E0B] focus:bg-white focus:ring-2"
            />
          ))}
        </div>

        {error ? (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !phone}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#0F172A] text-base font-semibold text-white transition hover:bg-[#1e293b] disabled:opacity-60"
        >
          {pending ? "Verifying..." : "Verify code"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={resending || !phone}
          className="w-full text-sm font-medium text-[#B45309] disabled:opacity-60"
        >
          {resending ? "Sending a new code..." : "Resend code"}
        </button>
      </motion.form>
    </AuthShell>
  );
}
