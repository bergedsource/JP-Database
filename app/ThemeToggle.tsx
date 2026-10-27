"use client";

import { useSyncExternalStore } from "react";
import { haptic } from "@/lib/haptics";

// The theme lives on <html data-theme>, set before paint by the inline script in
// app/layout.tsx (saved choice, else the phone's setting). Read it as an external
// store so the button follows it without a setState-in-effect.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const isDark = () => document.documentElement.dataset.theme === "dark";

export default function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    haptic();
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("jp-theme", next); } catch {}
  }

  return (
    <button type="button" className={className} onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
