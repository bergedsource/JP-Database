"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "ios-home" | "off" | "on" | "denied" | "busy";

// "Alert me" on the ticket: buzzes his phone when he's 2 away and when he's called,
// even with the page closed. iPhone only allows this from a Home Screen web app.
export default function NotifyButton({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      let next: State;
      if (!VAPID_KEY) next = "unsupported";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = ios && !standalone ? "ios-home" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        next = sub && Notification.permission === "granted" ? "on" : "off";
        // Same device, same ticket page: make sure the server has it.
        if (next === "on" && sub) fetch(`/api/jp-ticket/${token}/push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).catch(() => {});
      }
      if (alive) setState(next);
    })().catch(() => { if (alive) setState("unsupported"); });
    return () => { alive = false; };
  }, [token]);

  async function turnOn() {
    haptic();
    setError("");
    setState("busy");
    try {
      // Ask first, straight from the tap (iPhone requires it), then subscribe.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) }));
      const res = await fetch(`/api/jp-ticket/${token}/push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't turn on alerts. Try again.");
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setError("Couldn't turn on alerts on this phone.");
      setState("off");
    }
  }

  if (state === "loading" || state === "unsupported") return null;
  if (state === "ios-home") {
    return <p className="tk-fine">Want an alert when you&rsquo;re almost up? On iPhone, add JP to your Home Screen first (Share &rarr; Add to Home Screen), open it from there, and take your ticket in it.</p>;
  }
  if (state === "denied") return <p className="tk-fine">Alerts are blocked for this site. Turn notifications on in your phone&rsquo;s settings to get them.</p>;
  if (state === "on") return <p className="tk-fine">&#10003; Alerts on: we&rsquo;ll buzz you when you&rsquo;re 2 away and when you&rsquo;re called.</p>;
  return (
    <>
      <button type="button" className="tk-btn" disabled={state === "busy"} onClick={turnOn}>
        {state === "busy" ? "Turning on…" : "Alert me when I’m almost up"}
      </button>
      {error && <p className="tk-error" role="alert">{error}</p>}
    </>
  );
}
