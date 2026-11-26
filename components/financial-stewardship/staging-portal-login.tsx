"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "@/components/phosphor-icons";
import { ebGaramond, inter } from "@/app/fonts";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";
import { getStagingWorkspaces, WORKSPACES, type FinancialWorkspace } from "@/lib/financial-stewardship/staging-workspaces";

const STAGING_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";

export function isFinancialStaging() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL === STAGING_URL;
}

function Coat() {
  return <svg viewBox="705 0 277 230" width="36" height="34"
    role="img" aria-label="Diocesan coat of arms" className="shrink-0 overflow-hidden">
    <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
  </svg>;
}

export function StagingAuthShell({ children }: { children: React.ReactNode }) {
  return <main className={inter.className + " min-h-screen bg-[#FBF9F9] text-[#271C20]"}>
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
      <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
        <div className="relative z-10">
          <p className={ebGaramond.className + " text-[16px] italic leading-tight text-white/90 sm:text-lg"}>
            Diocesan Commission on Worship &amp; Liturgy
          </p>
          <p className={ebGaramond.className + " mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]"}>
            COWL-DOK Portal
          </p>
          <p className="mt-5 text-sm text-white/85">One secure sign-in. Your assigned role determines your workspace.</p>
        </div>
        <Image src="/images/church-facade-placeholder.svg" alt="" aria-hidden="true"
          width={900} height={1000} priority
          className="pointer-events-none absolute bottom-[-95px] left-1/2 h-[330px] w-auto max-w-none -translate-x-1/2 object-contain opacity-40 sm:bottom-[-120px] sm:h-[410px] lg:bottom-[-4%] lg:h-[65%]" />
      </aside>
      <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
        <Link href="/demo/finance" className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Financial Stewardship demonstration
        </Link>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
          <div className="w-full max-w-[440px]">
            <div className="mb-6 flex items-center gap-2.5">
              <Coat/>
              <p className={ebGaramond.className + " text-[19px] leading-tight text-[#1E1114]"}>Liturgical Ministry Registry</p>
            </div>
            {children}
            <p className="mt-7 text-center text-xs text-[#706167]">Fictional financial data only. No actual funds, receipts or production records.</p>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

const field = "h-14 w-full rounded-none border border-[#CDBFC3] bg-white px-4 text-base text-[#271C20] outline-none transition placeholder:text-[#8D8184] focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:cursor-not-allowed disabled:bg-[#F0ECEC]";
const button = "flex h-14 w-full items-center justify-center gap-2 rounded-none bg-[#890022] px-5 text-base font-semibold text-white transition hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";

export function StagingPortalLogin() {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const router = useRouter();
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [workspaces, setWorkspaces] = useState<FinancialWorkspace[]>([]);

  const evaluateUser = async () => {
    if (!client) { setError("Test authentication is not configured."); setLoading(false); return; }
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) {
      setWorkspaces([]); setSignedIn(false); setLoading(false); return;
    }
    try {
      const choices = await getStagingWorkspaces(client, data.user.id);
      setSignedIn(true);
      setWorkspaces(choices);
      if (choices.length === 1) router.replace(WORKSPACES[choices[0]].path);
    } catch {
      setError("Your access permissions could not be verified. Please try again.");
      setSignedIn(true);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!client) { setLoading(false); return; }
    void client.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (!error && data.user) await evaluateUser();
      else setLoading(false);
    });
    return () => { active = false; };
  // Recheck after sign-in below rather than responding to auth token-refresh events.
  }, [client]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || submitting || inFlight.current) return;
    inFlight.current = true; setSubmitting(true); setError(null);
    const { error: authError } = await client.auth.signInWithPassword({email:email.trim(),password});
    setPassword("");
    if (authError) {
      setError(/rate.?limit|too many|429/i.test(authError.message)
        ? "Too many attempts. Please allow the authentication limit to clear before trying again."
        : "We could not sign you in. Check your test account credentials and try again.");
    } else {
      await evaluateUser();
    }
    setSubmitting(false); inFlight.current = false;
  };
  const signOut = async () => {
    if (!client) return;
    await client.auth.signOut();
    setSignedIn(false); setWorkspaces([]); setError(null); setEmail(""); setPassword("");
  };

  return <StagingAuthShell>
    {loading ? <div role="status" className="flex items-center gap-3 text-[#890022]">
      <Loader2 className="h-5 w-5 animate-spin" /> Verifying staging identity…
    </div> : signedIn ? <>
      <ShieldCheck className="h-8 w-8 text-[#890022]" />
      <h1 className={ebGaramond.className + " mt-3 text-4xl"}>{workspaces.length ? "Select your workspace" : "Role approval required"}</h1>
      {workspaces.length ? <p className="mt-3 text-sm leading-6 text-[#66575B]">You have access to more than one authorized workspace.</p>
        : <p className="mt-3 text-sm leading-6 text-[#66575B]">Your test identity is authenticated, but no active financial workspace permission is available. Ask the office to review your role assignment.</p>}
      <div className="mt-6 space-y-3">{workspaces.map(key =>
        <Link key={key} href={WORKSPACES[key].path} className={button}>{WORKSPACES[key].label}</Link>)}
      </div>
      {error && <p className="mt-4 text-sm text-[#92202A]" role="alert">{error}</p>}
      <button onClick={() => void signOut()} className="mt-6 text-sm font-semibold text-[#0B5C5A] underline">Sign out / use another account</button>
    </> : <>
      <h1 className={ebGaramond.className + " text-[44px] font-medium leading-none text-[#1E1114] sm:text-[48px]"}>Sign in</h1>
      <p className="mt-3 text-sm text-[#706167]">DEMONSTRATION ONLY — sign in with a designated TEST account.</p>
      {error && <div role="alert" className="mt-6 flex items-start gap-3 border border-[#B42330] bg-[#FFF0F0] px-4 py-3 text-sm leading-6 text-[#92202A]">
        <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{error}</div>}
      <form className="mt-8 space-y-5" onSubmit={signIn}>
        <div className="space-y-2">
          <label htmlFor="unified-email" className="block text-sm font-semibold text-[#302428]">Email</label>
          <input id="unified-email" name="email" className={field} type="email"
            autoComplete="username" placeholder="Enter your email" required disabled={submitting}
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="unified-password" className="text-sm font-semibold text-[#302428]">Password</label>
            <span className="text-xs text-[#65575A]">Use your TEST account only</span>
          </div>
          <div className="relative">
            <input id="unified-password" name="password"
              className={field + " py-3 pl-4 pr-20"} type={showPassword ? "text" : "password"}
              autoComplete="current-password" placeholder="Enter your password" required
              disabled={submitting} value={password} onChange={e => setPassword(e.target.value)}/>
            <button type="button" onClick={() => setShowPassword(x => !x)} disabled={submitting}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-semibold text-[#890022] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022] disabled:opacity-50">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button className={button} type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin"/> Signing in…</> : "Sign in"}
        </button>
      </form>
      {process.env.NEXT_PUBLIC_RENEWAL_DEMO==="enabled"&&<Link href="/demo/finance/parish" className="mt-5 block text-center text-sm font-semibold text-[#0B5C5A] underline underline-offset-4">Parish Portal — mobile sign-in rehearsal</Link>}
    </>}
  </StagingAuthShell>;
}
