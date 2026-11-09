"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckCircle2, Circle, Loader2 } from "@/components/phosphor-icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, AlertCircle } from "@/components/phosphor-icons";
import { ebGaramond, inter } from "@/app/fonts";

function Coat() {
  return <svg viewBox="705 0 277 230" width="36" height="34" role="img" aria-label="Diocesan coat of arms" className="shrink-0 overflow-hidden"><image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" /></svg>;
}
function RecoveryShell({ children }: { children: React.ReactNode }) {
  return <main className={`${inter.className} min-h-screen bg-[#FBF9F9] text-[#271C20]`}>
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
      <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
        <div className="relative z-10">
          <p className={`${ebGaramond.className} text-[16px] italic leading-tight text-white/90 sm:text-lg`}>Diocesan Commission on Worship &amp; Liturgy</p>
          <p className={`${ebGaramond.className} mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]`}>COWL-DOK Portal</p>
        </div>
        <Image src="/images/church-facade-placeholder.svg" alt="" aria-hidden="true" width={900} height={1000} priority className="pointer-events-none absolute bottom-[-95px] left-1/2 h-[330px] w-auto max-w-none -translate-x-1/2 object-contain opacity-40 sm:bottom-[-120px] sm:h-[410px] lg:bottom-[-4%] lg:h-[65%]" />
      </aside>
      <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
        <Link href="/admin" className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[#0B5C5A] hover:underline"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to sign in</Link>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-10"><div className="w-full max-w-[440px]">
          <div className="mb-6 flex items-center gap-2.5"><Coat /><p className={`${ebGaramond.className} text-[19px] leading-tight text-[#1E1114]`}>Liturgical Ministry Registry</p></div>
          {children}
          <p className="mt-8 text-xs leading-6 text-[#706167]">Need assistance? <a href="mailto:help@cowl-dok.online" className="font-semibold text-[#0B5C5A] underline">help@cowl-dok.online</a></p>
        </div></div>
      </section>
    </div>
  </main>;
}
const mainButton = "flex h-14 w-full items-center justify-center gap-2 bg-[#890022] px-5 text-base font-semibold text-white transition hover:bg-[#70001B] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";
const fieldClass = "h-14 w-full border border-[#CDBFC3] bg-white px-4 pr-20 text-base outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:bg-[#F0ECEC]";
function ErrorBox({ children }: { children: React.ReactNode }) {return <div role="alert" className="mt-5 flex items-start gap-2 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm text-[#92202A]"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{children}</div>}

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

  return <RecoveryShell>
    {status === "checking" ? <><h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Checking reset link</h1><p role="status" className="mt-5 flex gap-2 text-sm text-[#706167]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Please wait…</p></> : null}
    {status === "invalid" ? <><h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Reset link unavailable</h1><ErrorBox>This reset link is invalid, expired, or has already been used. Please request a new link.</ErrorBox><Link href="/admin/forgot-password" className={`${mainButton} mt-6`}>Request a new reset link</Link></> : null}
    {status === "saved" ? <><CheckCircle2 className="mb-3 h-7 w-7 text-[#0B5C5A]" aria-hidden="true" /><h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Password updated</h1><p className="mt-3 text-sm leading-6 text-[#706167]">Your password has been changed. Sign in using your new password.</p><Link href="/admin" className={`${mainButton} mt-6`}>Back to sign in</Link></> : null}
    {status === "ready" ? <>
      <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-[#706167]">Create a new password for your admin account.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form className="mt-7 space-y-5" onSubmit={updatePassword}>
        <div><label htmlFor="new-password" className="mb-2 block text-sm font-semibold">New password</label><div className="relative"><input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} required className={fieldClass} value={password} onChange={e => setPassword(e.target.value)} disabled={saving}/><button type="button" disabled={saving} onClick={() => setShow(v => !v)} className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-[#0B5C5A]">{show ? "Hide" : "Show"}</button></div></div>
        <div className="border border-[#E6DADC] bg-white p-4 text-sm" aria-label="Password requirements">
          <p className="mb-3 font-semibold">Password requirements</p>
          <ul className="space-y-2" aria-live="polite" aria-relevant="text">
            {rules.map(rule => <li key={rule.label} className={`flex items-start gap-2 ${rule.passed ? "text-[#0B5C5A]" : "text-[#706167]"}`}>
              <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">{rule.passed ? <Check className="h-4 w-4 text-[#0B5C5A]" strokeWidth={2.5} /> : <Circle className="h-3.5 w-3.5 text-[#8A8588]" strokeWidth={1.5} />}</span>
              <span>{rule.label}<span className="sr-only"> — {rule.passed ? "met" : "not met"}</span></span>
            </li>)}
          </ul>
        </div>
        <div><label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold">Confirm new password</label><div className="relative"><input id="confirm-password" type={showConfirm ? "text" : "password"} autoComplete="new-password" required className={fieldClass} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving}/><button type="button" disabled={saving} onClick={() => setShowConfirm(v => !v)} className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-[#0B5C5A]">{showConfirm ? "Hide" : "Show"}</button></div>{confirm && confirm !== password && <p className="mt-2 text-xs text-[#92202A]">Passwords do not match.</p>}</div>
        <button type="submit" className={mainButton} disabled={saving || !allRulesPassed} aria-busy={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating…</> : "Update password"}</button>
      </form>
    </> : null}
  </RecoveryShell>;
}
