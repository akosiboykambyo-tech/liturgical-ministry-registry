"use client";

/**
 * First-time invitation acceptance.
 *
 * A Supabase invitation is verified by Supabase Auth using the one-use token
 * hash from the branded invitation email. An existing browser session alone
 * never enables password creation on this page.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Circle, Loader2 } from "@/components/phosphor-icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ebGaramond, inter } from "@/app/fonts";

type State = "verifying" | "ready" | "invalid" | "saved";
const PASSWORD_RULES = [
  ["At least 12 characters", (value: string) => value.length >= 12],
  ["At least one uppercase letter", (value: string) => /[A-Z]/.test(value)],
  ["At least one lowercase letter", (value: string) => /[a-z]/.test(value)],
  ["At least one number", (value: string) => /[0-9]/.test(value)],
  ["At least one special character", (value: string) => /[^A-Za-z0-9]/.test(value)],
] as const;

function Coat() {
  return <svg viewBox="705 0 277 230" width="36" height="34" role="img"
    aria-label="Diocesan coat of arms" className="shrink-0">
    <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5"/>
  </svg>;
}

export default function AcceptInvitationPage() {
  const router = useRouter();
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
      const queryToken = url.searchParams.get("token_hash");
      const queryType = url.searchParams.get("type");
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
      const token = queryToken ?? fragment.get("token_hash");
      const type = queryType ?? fragment.get("type");
      window.history.replaceState(null, "", "/admin/accept-invite");

      if (type !== "invite" || !token || !/^[a-f0-9]{40,128}$/i.test(token)) {
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

  const checks = PASSWORD_RULES.map(([label, test]) => ({ label, passed: test(password) }));
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

  const inputClass = "h-14 w-full border border-[#CDBFC3] bg-white px-4 pr-16 text-base text-[#271C20] outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15";
  const buttonClass = "flex min-h-14 w-full items-center justify-center gap-2 bg-[#890022] px-5 text-base font-semibold text-white hover:bg-[#70001B] disabled:cursor-not-allowed disabled:bg-[#D9CFD1]";

  return <main className={inter.className + " min-h-screen bg-[#FBF9F9] text-[#271C20]"}>
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
      <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
        <div className="relative z-10">
          <p className={ebGaramond.className + " text-[16px] italic leading-tight text-white/90 sm:text-lg"}>Diocesan Commission on Worship &amp; Liturgy</p>
          <p className={ebGaramond.className + " mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]"}>COWL-DOK Portal</p>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/90">Secure staff account activation</p>
        </div>
        <Image src="/images/church-facade-placeholder.svg" alt="" aria-hidden="true"
          width={900} height={1000} priority
          className="pointer-events-none absolute bottom-[-95px] left-1/2 h-[330px] w-auto max-w-none -translate-x-1/2 object-contain opacity-40 sm:bottom-[-120px] sm:h-[410px] lg:bottom-[-4%] lg:h-[65%]"/>
      </aside>
      <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
        <Link href="/admin" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#0B5C5A] hover:underline">
          <ArrowLeft size={16} aria-hidden="true"/> Back to sign in
        </Link>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
          <div className="w-full max-w-[440px]">
            <div className="mb-6 flex items-center gap-3">
              <Coat/>
              <p className={ebGaramond.className + " text-[19px]"}>Liturgical Ministry Registry</p>
            </div>
            {state === "verifying" && <>
              <h1 className={ebGaramond.className + " text-[44px]"}>Verifying invitation</h1>
              <p role="status" className="mt-4 flex items-center gap-2 text-sm text-[#706167]">
                <Loader2 size={18} className="animate-spin"/> Checking your secure invitation…
              </p>
            </>}
            {state === "invalid" && <>
              <h1 className={ebGaramond.className + " text-[44px]"}>Invitation unavailable</h1>
              <div role="alert" className="mt-5 flex gap-2 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm leading-6 text-[#92202A]">
                <AlertCircle size={18} className="mt-0.5 shrink-0"/>
                This invitation link may have expired or already been accepted. You can still create a password by requesting a verified password setup email.
              </div>
              <Link className={buttonClass + " mt-6"} href="/admin/forgot-password">Request a password setup link</Link>
            </>}
            {state === "saved" && <>
              <CheckCircle2 size={31} className="mb-3 text-[#0B5C5A]"/>
              <h1 className={ebGaramond.className + " text-[44px]"}>Account activated</h1>
              <p className="mt-3 text-sm leading-6 text-[#706167]">Your password was created successfully. Sign in to open your authorized COWL or Curia workspace.</p>
              <Link href="/admin" className={buttonClass + " mt-6"}>Sign in</Link>
            </>}
            {state === "ready" && <>
              <h1 className={ebGaramond.className + " text-[44px]"}>Create your password</h1>
              <p className="mt-3 text-sm leading-6 text-[#706167]">
                Invitation verified{accountEmail ? " for " + accountEmail : ""}. Choose a personal password to complete your staff account.
              </p>
              {error && <p role="alert" className="mt-5 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm text-[#92202A]">{error}</p>}
              <form className="mt-7 space-y-5" onSubmit={submit}>
                <div>
                  <label htmlFor="invite-password" className="mb-2 block text-sm font-semibold">New password</label>
                  <div className="relative">
                    <input id="invite-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                      className={inputClass} minLength={12} required value={password}
                      onChange={event => setPassword(event.target.value)} disabled={saving}/>
                    <button type="button" onClick={() => setShowPassword(x => !x)}
                      aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-[#890022]">
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div className="border border-[#E6DADC] bg-white p-4 text-sm">
                  <p className="mb-3 font-semibold">Password requirements</p>
                  <ul className="space-y-2" aria-live="polite">
                    {checks.map(rule => <li key={rule.label} className={"flex items-start gap-2 " + (rule.passed ? "text-[#0B5C5A]" : "text-[#706167]")}>
                      {rule.passed ? <Check size={16} className="mt-0.5 shrink-0"/> : <Circle size={15} className="mt-0.5 shrink-0"/>}
                      <span>{rule.label}</span>
                    </li>)}
                  </ul>
                </div>
                <div>
                  <label htmlFor="invite-confirm" className="mb-2 block text-sm font-semibold">Confirm password</label>
                  <input id="invite-confirm" type="password" autoComplete="new-password" required className={inputClass}
                    value={confirm} onChange={event => setConfirm(event.target.value)} disabled={saving}/>
                </div>
                <button type="submit" className={buttonClass} disabled={saving || !valid}>
                  {saving ? <><Loader2 size={18} className="animate-spin"/> Saving…</> : "Create password"}
                </button>
              </form>
            </>}
            <p className="mt-8 text-xs leading-6 text-[#706167]">
              Problems completing your account?{" "}
              <a href="mailto:help@cowl-dok.online" className="font-semibold text-[#0B5C5A] underline">help@cowl-dok.online</a>
            </p>
          </div>
        </div>
      </section>
    </div>
  </main>;
}