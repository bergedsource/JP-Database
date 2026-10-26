"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import PasswordInput from "../PasswordInput";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  async function forgotPassword() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setResetLoading(true);
    setError("");
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setResetLoading(false);
    setResetSent(true);
  }

  return (
    <>
      <style>{`
        :root {
          --bg: #FFFFFF;
          --surface: #FFFFFF;
          --surface-2: #FFFFFF;
          --border: #000000;
          --gold: #D73F09;
          --gold-dim: #D73F09;
          --text: #000000;
          --text-muted: #000000;
          --text-dim: #000000;
          --red: #D73F09;
        }

        .login-page {
          min-height: 100vh;
          background: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: var(--font-sans), system-ui, sans-serif;
        }

        .login-card {
          background: var(--surface);
          border: 1px solid #C6DAE7; border-top: 6px solid #D73F09;
          border-radius: 12px;
          padding: 40px;
          width: 100%;
          max-width: 360px;
        }

        .login-gold-bar {
          width: 3px;
          height: 30px;
          background: var(--gold);
          border-radius: 2px;
          margin-bottom: 20px;
        }

        .login-title {
          font-family: var(--font-sans), system-ui, sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.1;
          margin-bottom: 4px;
        }

        .login-subtitle {
          font-size: 10px;
          color: var(--text-dim);
          font-family: var(--font-sans), system-ui, sans-serif;
          margin-bottom: 32px;
        }

        .login-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 6px;
          font-family: var(--font-sans), system-ui, sans-serif;
        }

        .login-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 10px 12px;
          font-size: 13px;
          font-family: var(--font-sans), system-ui, sans-serif;
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          margin-bottom: 16px;
        }
        .login-input:focus {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 3px #C6DAE7;
        }

        .login-error {
          font-size: 12px;
          color: var(--red);
          margin-bottom: 12px;
          font-family: var(--font-sans), system-ui, sans-serif;
        }

        .login-btn {
          width: 100%;
          background: var(--gold);
          color: #FFFFFF;
          border: none;
          padding: 10px;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          font-family: var(--font-sans), system-ui, sans-serif;
          cursor: pointer;
          transition: opacity 0.15s;
          margin-top: 4px;
        }
        .login-btn:hover { opacity: 0.85; }
        .login-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .forgot-btn {
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 11px;
          font-family: var(--font-sans), system-ui, sans-serif;
          cursor: pointer;
          padding: 0;
          margin-top: 12px;
          display: block;
          width: 100%;
          text-align: center;
          transition: color 0.15s;
        }
        .forgot-btn:hover { color: var(--gold); }
        .forgot-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .reset-success {
          font-size: 12px;
          color: #000000;
          margin-top: 14px;
          font-family: var(--font-sans), system-ui, sans-serif;
          text-align: center;
          line-height: 1.5;
        }
      `}</style>

      <div className="login-page">
        <div className="login-card">
          <div className="login-gold-bar" />
          <h1 className="login-title">JP Admin</h1>
          <p className="login-subtitle">Acacia · Oregon State</p>

          <form onSubmit={login}>
            <label className="login-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="login-input"
            />
            <label className="login-label">Password</label>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading} className="login-btn">
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button type="button" onClick={forgotPassword} disabled={resetLoading} className="forgot-btn">
              {resetLoading ? "Sending…" : "Forgot password?"}
            </button>
            {resetSent && (
              <p className="reset-success">Reset link sent — check your email.</p>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
