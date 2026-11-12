"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "@/components/phosphor-icons";
import { AdminAuthShell, AuthError, AuthPasswordRules, authTitleClass, authInputClass, authLabelClass, authToggleClass, authPrimaryButtonClass } from "@/components/admin-auth-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowserClient();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "saved">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // Branded links carry an explicit one-time token hash; verify that token
    // with Supabase before accepting any currently active session.
    const initialUrl = new URL(window.location.href);
    const tokenHash = initialUrl.searchParams.get("token_hash");
    const recoveryType = initialUrl.searchParams.get("type");
    if (recoveryType === "recovery" && tokenHash) {
      window.history.replaceState(null, "", "/admin/reset-password");
      void supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })
        .then(({ data, error }) => {
          if (active) setStatus(!error && data.user && data.session ? "ready" : "invalid");
        }).catch(() => { if (active) setStatus("invalid"); });
      return () => { active = false; };
    }
    // Preserve legacy Supabase recovery-link behavior for existing Registry users.
    // Only permit password changes when opened through a recovery URL.
    // A normal signed-in admin session is not sufficient.
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const recoveryUrl = fragment.get("type") === "recovery" || url.searchParams.get("type") === "recovery" || url.searchParams.has("code") || url.searchParams.has("token_hash");
    let recoveryEvent = false;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
      if (session && (recoveryEvent || recoveryUrl)) setStatus("ready");
    });
    void (async () => {
      try {
        // Give the Supabase client time to consume the recovery credentials.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (!sessionError && data.session && (recoveryEvent || recoveryUrl)) setStatus("ready");
        else {
          await new Promise(resolve => setTimeout(resolve, 700));
          if (active) setStatus(current => current === "ready" ? current : "invalid");
        }
      } catch { if (active) setStatus("invalid"); }
    })();
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, [supabase]);

  const rules = [
    { label: "At least 12 characters", passed: password.length >= 12 },
    { label: "At least one uppercase letter (A–Z)", passed: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter (a–z)", passed: /[a-z]/.test(password) },
    { label: "At least one number (0–9)", passed: /[0-9]/.test(password) },
    { label: "At least one special character", passed: /[^A-Za-z0-9]/.test(password) },
    { label: "Passwords match", passed: confirm.length > 0 && confirm === password },
  ];
  const allRulesPassed = rules.every(rule => rule.passed);
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || status !== "ready" || !allRulesPassed) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError("We could not update your password. Request a new link and try again."); return; }
      setStatus("saved");
      await supabase.auth.signOut();
    } catch { setError("We could not update your password right now. Please try again."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <AdminAuthShell showSupport backHref="/admin" backLabel="Back to sign in">
    {status === "checking" ? <><h1 className={authTitleClass}>Checking reset link</h1><p role="status" className="mt-5 flex gap-2 text-sm text-[#706167]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Please wait…</p></> : null}
    {status === "invalid" ? <><h1 className={authTitleClass}>Reset link unavailable</h1><AuthError className="mt-5">This reset link is invalid, expired, or has already been used. Please request a new link.</AuthError><Link href="/admin/forgot-password" className={authPrimaryButtonClass + " mt-6"}>Request a new reset link</Link></> : null}
    {status === "saved" ? <><CheckCircle2 className="mb-3 h-7 w-7 text-[#0B5C5A]" aria-hidden="true" /><h1 className={authTitleClass}>Password updated</h1><p className="mt-3 text-sm leading-6 text-[#706167]">Your password has been changed. Sign in using your new password.</p><Link href="/admin" className={authPrimaryButtonClass + " mt-6"}>Back to sign in</Link></> : null}
    {status === "ready" ? <>
      <h1 className={authTitleClass}>Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-[#706167]">Create a new password for your COWL-DOK staff account.</p>
      {error && <AuthError className="mt-5">{error}</AuthError>}
      <form className="mt-7 space-y-5" onSubmit={updatePassword}>
        <div><label htmlFor="new-password" className={"mb-2 " + authLabelClass}>New password</label><div className="relative"><input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Create a password" minLength={12} required className={authInputClass + " pr-20"} value={password} onChange={e => setPassword(e.target.value)} disabled={saving}/><button type="button" disabled={saving} onClick={() => setShow(v => !v)}
  aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
  className={authToggleClass}>{show ? "Hide" : "Show"}</button></div></div>
        <AuthPasswordRules rules={rules} />
        <div><label htmlFor="confirm-password" className={"mb-2 " + authLabelClass}>Confirm new password</label><div className="relative"><input id="confirm-password" type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="Confirm your password" required className={authInputClass + " pr-20"} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving}/><button type="button" disabled={saving} onClick={() => setShowConfirm(v => !v)}
  aria-label={showConfirm ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirm}
  className={authToggleClass}>{showConfirm ? "Hide" : "Show"}</button></div>{confirm && confirm !== password && <p className="mt-2 text-xs text-[#92202A]">Passwords do not match.</p>}</div>
        <button type="submit" className={authPrimaryButtonClass} disabled={saving || !allRulesPassed} aria-busy={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating…</> : "Update password"}</button>
      </form>
    </> : null}
  </AdminAuthShell>;
}
