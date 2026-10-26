"use client";

import { useState } from "react";

// Password field with an eye button that shows/hides what's typed.
// Used by the login and reset-password pages (both style `.login-input`).
export default function PasswordInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        className="login-input"
        style={{ marginBottom: 0, paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
      </button>
    </div>
  );
}
