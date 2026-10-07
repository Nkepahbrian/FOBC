"use client";

import { useEffect, useState } from "react";
import { playAlertSound } from "@/lib/push/alerts";
import { enablePhoneAlerts, phoneAlertsReady } from "@/lib/push/register";

export function AlertBridge() {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) return;
    const ready = window.localStorage.getItem("fobc-alerts") === "on" || Notification.permission === "granted";
    if (ready) {
      enablePhoneAlerts().catch(() => undefined);
    } else if (Notification.permission === "default" && window.localStorage.getItem("fobc-alerts") !== "later") {
      setOffer(true);
    }

    function onMessage(event: MessageEvent) {
      if (event.data?.type === "fobc-chime") playAlertSound();
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!offer || phoneAlertsReady()) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-30 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 rounded-2xl border border-[#EAB308]/40 bg-[#0F172A] p-3 text-white shadow-2xl">
      <p className="text-sm font-semibold">Blessing alerts</p>
      <p className="mt-1 text-xs leading-5 text-zinc-300">
        Hear a chime and see FOBC at the top of your phone when someone amens, comments, follows, or messages you.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            enablePhoneAlerts()
              .then((on) => {
                window.localStorage.setItem("fobc-alerts", on ? "on" : "later");
                setOffer(false);
              })
              .finally(() => setBusy(false));
          }}
          className="h-9 flex-1 rounded-full bg-[#EAB308] text-sm font-semibold text-black"
        >
          Allow alerts
        </button>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem("fobc-alerts", "later");
            setOffer(false);
          }}
          className="h-9 rounded-full px-3 text-sm text-zinc-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
