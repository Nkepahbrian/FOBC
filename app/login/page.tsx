"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const OTP_PHONE_KEY = "fobc-otp-phone";

function toE164(input: string) {
  const compact = input.trim().replace(/[\s()-]/g, "");

  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^6\d{8}$/.test(compact)) return `+237${compact}`;

  return `+${compact.replace(/^\+/, "")}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const configured = getSupabaseEnv().isConfigured;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const e164 = toE164(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      setError("Enter a valid phone number, including the country code.");
      return;
    }

    if (!configured) {
      setError("Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local before requesting a code.");
      return;
    }

    setPending(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    setPending(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    sessionStorage.setItem(OTP_PHONE_KEY, e164);
    router.push(`/verify?phone=${encodeURIComponent(e164)}`);
  }

  return (
    <AuthShell
      title="Welcome in"
      subtitle="Use your phone number. We will send a one-time code so only real people join the community."
    >
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        onSubmit={onSubmit}
        className="space-y-5"
      >
        <label className="block">
          <span className="text-sm font-medium">Phone number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+237 6XX XXX XXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-lg outline-none ring-[#F59E0B] transition focus:border-[#F59E0B] focus:bg-white focus:ring-2"
            required
          />
          <span className="mt-2 block text-xs text-slate-500">
            Cameroon numbers can be entered as 6XXXXXXXX. Other countries need a + country code.
          </span>
        </label>

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
          {pending ? "Sending code..." : "Send code"}
        </button>
      </motion.form>
    </AuthShell>
  );
}
