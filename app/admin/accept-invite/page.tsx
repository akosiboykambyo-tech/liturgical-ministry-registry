"use client";

/**
 * First-time invitation acceptance.
 *
 * A Supabase invitation is verified by Supabase Auth using the one-use token
 * hash from the branded invitation email. An existing browser session alone
 * never enables password creation on this page.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "@/components/phosphor-icons";
import { AdminAuthShell, AuthError, AuthPasswordRules, authTitleClass, authTextClass, authInputClass, authLabelClass, authToggleClass, authPrimaryButtonClass } from "@/components/admin-auth-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseInviteChallenge } from "@/lib/auth-invitation-challenge";

type State = "verifying" | "ready" | "invalid" | "saved";
const PASSWORD_RULES = [
  ["At least 12 characters", (value: string) => value.length >= 12],
  ["At least one uppercase letter", (value: string) => /[A-Z]/.test(value)],
  ["At least one lowercase letter", (value: string) => /[a-z]/.test(value)],
  ["At least one number", (value: string) => /[0-9]/.test(value)],
  ["At least one special character", (value: string) => /[^A-Za-z0-9]/.test(value)],
] as const;

export default function AcceptInvitationPage() {
  const [state, setState] = useState<State>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const verifiedUser = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      // Capture and immediately clear the one-use token to minimize leakage
      // through browser history, shared screen and future navigations.
      const url = new URL(window.location.href);
      const token = parseInviteChallenge(url.href);
      window.history.replaceState(null, "", "/admin/accept-invite");

      if (!token) {
        if (mounted) setState("invalid");
        return;
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          type: "invite",
          token_hash: token,
        });
        if (!mounted) return;
        if (verifyError || !data.user || !data.session || data.user.is_anonymous) {
          setState("invalid");
          return;
        }
        // The session returned by THIS verified invite—not any older login—
        // is the only session allowed to establish a first-time password.
        verifiedUser.current = data.user.id;
        setAccountEmail(data.user.email ?? "");
        setState("ready");
      } catch {
        if (mounted) setState("invalid");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const checks: Array<{ label: string; passed: boolean }> = PASSWORD_RULES.map(([label, test]) => ({ label, passed: test(password) }));
  checks.push({ label: "Passwords match", passed: Boolean(confirm) && confirm === password });
  const valid = checks.every(rule => rule.passed);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state !== "ready" || inFlight.current || !valid || !verifiedUser.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      // Recheck the active session belongs to the invitation verified above.
      const { data, error: identityError } = await supabase.auth.getUser();
      if (identityError || data.user?.id !== verifiedUser.current) {
        verifiedUser.current = null;
        setState("invalid");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Unable to save your password. Please request a new invitation or a password setup link.");
        return;
      }
      setPassword("");
      setConfirm("");
      verifiedUser.current = null;
      setState("saved");
      await supabase.auth.signOut();
    } catch {
      setError("Password setup could not be completed. Please try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <AdminAuthShell showSupport>
            {state === "verifying" && <>
              <h1 className={authTitleClass}>Verifying invitation</h1>
              <p role="status" className="mt-4 flex items-center gap-2 text-sm text-[#706167]">
                <Loader2 size={18} className="animate-spin"/> Checking your secure invitation…
              </p>
            </>}
            {state === "invalid" && <>
              <h1 className={authTitleClass}>Invitation unavailable</h1>
              <AuthError className="mt-6">This invitation has expired, was already accepted, or cannot be verified. Use the password setup link to continue securely.</AuthError>
              <Link className={authPrimaryButtonClass + " mt-6"} href="/admin/forgot-password">Request a password setup link</Link>
            </>}
            {state === "saved" && <>
              <CheckCircle2 size={31} className="mb-3 text-[#0B5C5A]"/>
              <h1 className={authTitleClass}>Account activated</h1>
              <p className={authTextClass}>Your password was created successfully. Sign in to open your authorized COWL or Curia workspace.</p>
              <Link href="/admin" className={authPrimaryButtonClass + " mt-6"}>Sign in</Link>
            </>}
            {state === "ready" && <>
              <h1 className={authTitleClass}>Create your password</h1>
              <p className={authTextClass}>
                Invitation verified{accountEmail ? <> for <span className="break-all font-semibold">{accountEmail}</span></> : null}. Choose a personal password to complete your staff account.
              </p>
              {error && <AuthError className="mt-6">{error}</AuthError>}
              <form className="mt-7 space-y-5" onSubmit={submit}>
                <div>
                  <label htmlFor="invite-password" className={"mb-2 " + authLabelClass}>New password</label>
                  <div className="relative">
                    <input id="invite-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                      className={authInputClass + " pr-20"} minLength={12} required value={password}
                      onChange={event => setPassword(event.target.value)} disabled={saving}/>
                    <button type="button" onClick={() => setShowPassword(x => !x)}
                      aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={saving}
                      className={authToggleClass}>
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <AuthPasswordRules rules={checks} />
                <div>
                  <label htmlFor="invite-confirm" className={"mb-2 " + authLabelClass}>Confirm password</label>
                  <input id="invite-confirm" type="password" autoComplete="new-password" required className={authInputClass}
                    value={confirm} onChange={event => setConfirm(event.target.value)} disabled={saving}/>
                </div>
                <button type="submit" className={authPrimaryButtonClass} disabled={saving || !valid}>
                  {saving ? <><Loader2 size={18} className="animate-spin"/> Saving…</> : "Create password"}
                </button>
              </form>
            </>}
  </AdminAuthShell>;
}
