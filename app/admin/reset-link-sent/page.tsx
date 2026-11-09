"use client";
import { useEffect, useState } from "react";
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
          <p className={`${ebGaramond.className} mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]`}>Admin Portal</p>
        </div>
        <Image src="/images/church-facade-placeholder.svg" alt="" aria-hidden="true" width={900} height={1000} priority className="pointer-events-none absolute bottom-[-95px] left-1/2 h-[330px] w-auto max-w-none -translate-x-1/2 object-contain opacity-40 sm:bottom-[-120px] sm:h-[410px] lg:bottom-[-4%] lg:h-[65%]" />
      </aside>
      <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
        <Link href="/admin" className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-[#0B5C5A] hover:underline"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to sign in</Link>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-10"><div className="w-full max-w-[440px]">
          <div className="mb-6 flex items-center gap-2.5"><Coat /><p className={`${ebGaramond.className} text-[19px] leading-tight text-[#1E1114]`}>Liturgical Ministry Registry</p></div>
          {children}
          <p className="mt-8 text-xs leading-6 text-[#706167]">Need assistance? <a href="mailto:help@cowl-dok.online" className="font-semibold text-[#0B5C5A] underline">help@cowl-dok.online</a></p>
        </div></div>
      </section>
    </div>
  </main>;
}
const mainButton = "flex h-14 w-full items-center justify-center gap-2 bg-[#890022] px-5 text-sm font-semibold text-white transition hover:bg-[#70001B] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";
const fieldClass = "h-14 w-full border border-[#CDBFC3] bg-white px-4 pr-20 text-base outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:bg-[#F0ECEC]";
function ErrorBox({ children }: { children: React.ReactNode }) {return <div role="alert" className="mt-5 flex items-start gap-2 border border-[#B42330] bg-[#FFF0F0] p-4 text-sm text-[#92202A]"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{children}</div>}

export default function ResetLinkSentPage() {
  const [remaining, setRemaining] = useState(60);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setRemaining(Math.max(0, 60 - Math.floor((Date.now() - start) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <RecoveryShell>
    <h1 className={`${ebGaramond.className} text-[44px] leading-[1.15] sm:text-[48px]`}>Check your email</h1>
    <p className="mt-3 text-sm leading-6 text-[#706167]">If that address matches an admin account, a password reset link is on its way.</p>
    <p className="mt-5 border border-[#E6DADC] bg-white p-4 text-sm leading-6 text-[#706167]">Nothing there? Check your spam folder. Reset links expire after the validity period configured in Supabase Auth.</p>
    <Link href="/admin" className={`${mainButton} mt-7`}>Back to sign in</Link>
    <p className="mt-5 text-sm text-[#706167]">{remaining > 0 ? `You can request another link in ${remaining} seconds.` : "Still no email? You can request another reset link."}</p>
    {remaining === 0 && <Link href="/admin/forgot-password" className="mt-2 inline-block text-sm font-semibold text-[#0B5C5A] underline">Request another link</Link>}
  </RecoveryShell>;
}
