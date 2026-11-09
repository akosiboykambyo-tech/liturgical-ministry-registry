"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";
import { StagingAuthShell } from "@/components/financial-stewardship/staging-portal-login";

const field = "h-14 w-full border border-[#CDBFC3] bg-white px-4 text-base outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15";
const button = "flex h-14 w-full items-center justify-center gap-2 bg-[#890022] px-5 text-base font-semibold text-white hover:bg-[#71001C] disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";

export function StagingForgotPassword() {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const inFlight = useRef(false);
  const [email,setEmail] = useState("");
  const [loading,setLoading] = useState(false);
  const [submitted,setSubmitted] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const send = async (e:FormEvent) => {
    e.preventDefault();
    if (!client || inFlight.current) return;
    inFlight.current = true;setLoading(true);setError(null);
    try {
      const { error: err } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/admin/reset-password",
      });
      if (err && /rate.?limit|too many|429/i.test(err.message)) {
        setError("The email service is temporarily limiting reset requests. Check for an earlier message before requesting another link.");
      } else if (err) {
        // Avoid exposing account existence; a technical failure still needs clear feedback.
        setError("The password-reset request could not be completed. Please check the test project's SMTP and recovery redirect settings.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Could not connect to the authentication service. Please try again.");
    } finally {
      setLoading(false);inFlight.current=false;
    }
  };
  return <StagingAuthShell>
    {submitted ? <>
      <CheckCircle2 className="mb-4 h-7 w-7 text-[#0B5C5A]"/>
      <h1 className={ebGaramond.className+" text-[44px]"}>Check your email</h1>
      <p className="mt-3 text-sm leading-6 text-[#66575B]">If the address is registered, a reset link has been sent. Check Spam as well as your inbox. Use the most recent valid link.</p>
      <p className="mt-4 text-sm text-[#66575B]">For security, avoid requesting repeated emails while the provider's rate limit is active.</p>
    </> : <>
      <h1 className={ebGaramond.className+" text-[44px]"}>Reset your password</h1>
      <p className="mt-3 text-sm leading-6 text-[#66575B]">Enter your COWL-DOK test account email. A secure recovery link will let you create a new password.</p>
      {error && <div role="alert" className="mt-5 flex gap-2 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm text-[#92202A]">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0"/>{error}</div>}
      <form className="mt-6 space-y-4" onSubmit={send}>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Account email</span>
          <input type="email" autoComplete="email" className={field} required value={email}
            onChange={e=>setEmail(e.target.value)} disabled={loading}/>
        </label>
        <button className={button} type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-5 w-5 animate-spin"/>Sending…</> : "Send password reset link"}
        </button>
      </form>
    </>}
    <Link className="mt-6 inline-block text-sm font-semibold text-[#0B5C5A] underline" href="/admin">Back to sign in</Link>
  </StagingAuthShell>;
}

export function StagingSetNewPassword() {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const router = useRouter();
  const [valid,setValid] = useState(false);
  const [checking,setChecking] = useState(true);
  const [password,setPassword] = useState("");
  const [repeat,setRepeat] = useState("");
  const [saving,setSaving] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const recoveryEvent = useRef(false);

  useEffect(() => {
    if (!client) {setChecking(false);return;}
    let active = true;
    // A normal existing session is never sufficient authorization for the
    // *password recovery page*. Supabase must establish a recovery session.
    const rawHash = window.location.hash;
    const rawQuery = window.location.search;
    const hasRecoveryFragment = /(?:^|[&#])type=recovery(?:&|$)/.test(rawHash)
      && /(?:^|[&#])access_token=/.test(rawHash);
    const hasRecoveryQuery = /(?:^|[?&])type=recovery(?:&|$)/.test(rawQuery)
      && /(?:^|[?&])token_hash=/.test(rawQuery);
    const { data: authSub } = client.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        recoveryEvent.current=true;
        setValid(true);setChecking(false);
      }
    });
    void (async()=>{
      // A token_hash URL is supported when the Supabase email template is
      // configured for token_hash rather than ConfirmationURL; verifyOtp
      // authenticates it instead of trusting the URL alone.
      if (hasRecoveryQuery) {
        const params=new URLSearchParams(rawQuery);
        const token_hash=params.get("token_hash");
        if(token_hash){
          const {error:err}=await client.auth.verifyOtp({token_hash,type:"recovery"});
          if(!active)return;
          if(err){setError("The recovery link is invalid or expired. Request a new one.");setChecking(false);return;}
          recoveryEvent.current=true;setValid(true);setChecking(false);
          window.history.replaceState({}, "", "/admin/reset-password");
          return;
        }
      }
      if (hasRecoveryFragment) {
        // The shared client exchanges the recovery link and emits
        // PASSWORD_RECOVERY. Do not accept the fragment without that event.
        await client.auth.initialize();
        if (!active) return;
        if (!recoveryEvent.current) {
          setError("The recovery link could not be verified. Request a new link.");
          setChecking(false);
        }
      } else {
        // Allow the SDK's recovery event to run before deciding the URL
        // lacks authorization; ordinary signed-in sessions are rejected.
        await client.auth.initialize();
        if (!active) return;
        if (!recoveryEvent.current) {
          setError("Open the password-reset link from your email to continue.");
          setChecking(false);
        }
      }
    })();
    return()=>{active=false;authSub.subscription.unsubscribe();};
  },[client]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!client||!valid||saving||password.length<12||password!==repeat)return;
    setSaving(true);setError(null);
    const { error:err }=await client.auth.updateUser({password});
    setPassword("");setRepeat("");
    if(err){setError("The password could not be updated. Request a fresh recovery link if yours has expired.");}
    else{
      setDone(true);setValid(false);
      await client.auth.signOut();
    }
    setSaving(false);
  };

  return <StagingAuthShell>
    {done ? <>
      <CheckCircle2 className="h-8 w-8 text-[#0B5C5A]"/>
      <h1 className={ebGaramond.className+" mt-3 text-[40px]"}>Password updated</h1>
      <p className="mt-3 text-sm leading-6 text-[#66575B]">Your new password was saved. Sign in again to open your authorized workspace.</p>
      <button className={button+" mt-6"} onClick={()=>router.replace("/admin")}>Return to sign in</button>
    </> : <>
      <h1 className={ebGaramond.className+" text-[40px]"}>Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-[#66575B]">Your recovery link must be verified before a new password can be saved.</p>
      {checking ? <p className="mt-5 flex items-center gap-2 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin"/> Verifying secure link…</p>
        : valid ? <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-semibold">New password (at least 12 characters)</span>
            <input type="password" autoComplete="new-password" className={field} minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/>
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Confirm new password</span>
            <input type="password" autoComplete="new-password" className={field} minLength={12} required value={repeat} onChange={e=>setRepeat(e.target.value)}/>
          </label>
          {password&&repeat&&password!==repeat&&<p className="text-sm text-[#92202A]">Passwords do not match.</p>}
          <button className={button} type="submit" disabled={saving||password.length<12||password!==repeat}>
            {saving ? <><Loader2 className="h-5 w-5 animate-spin"/>Saving…</> : "Set new password"}
          </button>
        </form> : <p className="mt-5 text-sm leading-6 text-[#92202A]">This page cannot update your password without a verified recovery link.</p>}
      {error&&<div role="alert" className="mt-5 flex items-start gap-2 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm text-[#92202A]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
      <Link className="mt-6 inline-block text-sm font-semibold text-[#0B5C5A] underline" href="/admin/forgot-password">Request a fresh reset link</Link>
    </>}
  </StagingAuthShell>;
}
