"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { destinationForUser } from "@/lib/auth/destination";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const AUTH_EMAIL_KEY = "fobc-auth-email";
const AUTH_INTENT_KEY = "fobc-auth-intent";

export default function VerifyPage() {
  const router = useRouter();
  const leaving = useRef(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const configured = getSupabaseEnv().isConfigured;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextEmail = params.get("email") || sessionStorage.getItem(AUTH_EMAIL_KEY) || "";
    if (nextEmail) {
      sessionStorage.setItem(AUTH_EMAIL_KEY, nextEmail);
      setEmail(nextEmail);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();

    async function continueIfVerified() {
      if (leaving.current) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      leaving.current = true;
      const intent = sessionStorage.getItem(AUTH_INTENT_KEY);
      const destination = await destinationForUser(supabase, session.user, intent);
      sessionStorage.removeItem(AUTH_INTENT_KEY);
      router.replace(destination);
      router.refresh();
    }

    continueIfVerified();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) continueIfVerified();
    });

    const timer = window.setInterval(continueIfVerified, 3000);

    return () => {
      subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [configured, router]);

  async function continueManually() {
    if (!configured) {
      setError("Supabase is not configured yet.");
      return;
    }

    setPending(true);
    setError("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setPending(false);
      setError("Confirm the email first, then continue.");
      return;
    }

    const intent = sessionStorage.getItem(AUTH_INTENT_KEY);
    const destination = await destinationForUser(supabase, session.user, intent);
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    router.replace(destination);
    router.refresh();
  }

  async function resend() {
    if (!email || !configured) return;

    setResending(true);
    setError("");
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    setResending(false);

    if (resendError) setError(resendError.message);
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle="We sent a confirmation link/code to your email address."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-6"
      >
        <div className="rounded-3xl bg-[#0F172A] px-5 py-6 text-white">
          <Mail className="h-6 w-6 text-[#FBBF24]" />
          <p className="mt-4 text-lg font-semibold leading-7">
            We sent a confirmation link/code to your email address.
          </p>
          {email ? <p className="mt-2 text-sm text-slate-300">{email}</p> : null}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          Open the message and confirm your address. This page continues to onboarding or the feed as soon as the session is verified.
        </p>

        {error ? (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={continueManually}
          disabled={pending}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#F59E0B] text-base font-semibold text-[#0F172A] transition hover:bg-[#fbbf24] disabled:opacity-60"
        >
          {pending ? "Checking..." : "Continue"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={resending || !email}
          className="w-full text-sm font-medium text-[#B45309] disabled:opacity-60"
        >
          {resending ? "Sending again..." : "Resend email"}
        </button>
      </motion.div>
    </AuthShell>
  );
}
