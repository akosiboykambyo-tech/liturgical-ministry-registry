import Link from "next/link";
import type { ReactNode } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, Files, QrCode, ShieldCheck, ClipboardCheck } from "@/components/phosphor-icons";

export const demoButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#890022] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#70001c] disabled:cursor-not-allowed disabled:opacity-40";
export const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#DCCFD2] bg-white px-4 py-2 text-sm font-semibold text-[#6B2334] transition hover:bg-[#FAF2F4]";
export const field = "min-h-10 w-full rounded-md border border-[#DCCFD2] bg-white px-3 py-2 text-sm text-[#291A1E] outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15";
export const card = "rounded-lg border border-[#E6DADC] bg-white p-4 shadow-[0_2px_10px_rgba(45,17,26,0.025)] sm:p-5";
export const muted = "text-sm leading-6 text-[#6A5960]";
export function DemoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FBF9F9] text-[#211318]">
      <div className="border-b border-[#E2C8D0] bg-[#3A0010] px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">
        INTERACTIVE PROTOTYPE · FICTIONAL DATA · NO LIVE OTP, PAYMENTS OR DATABASE WRITES
      </div>
      <header className="border-b border-[#E6DADC] bg-white">
        <div className="mx-auto flex max-w-[1460px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-7">
          <Link href="/prototype" className="flex items-center gap-3 text-[#890022]">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-[#890022] text-white"><ShieldCheck className="h-6 w-6"/></div>
            <div><div className={ebGaramond.className + " text-2xl font-semibold leading-6"}>COWL-DOK</div><div className="text-[10px] font-semibold uppercase tracking-widest text-[#6A5960]">Workflow Laboratory</div></div>
          </Link>
          <nav aria-label="Prototype pages" className="flex flex-wrap gap-1 text-xs font-semibold sm:text-sm">
            <Link href="/prototype" className="rounded-md px-3 py-2 hover:bg-[#F8F1F3]">Overview</Link>
            <Link href="/prototype/registration" className="rounded-md px-3 py-2 hover:bg-[#F8F1F3]">Registration</Link>
            <Link href="/prototype/parish" className="rounded-md px-3 py-2 hover:bg-[#F8F1F3]">Parish Portal</Link>
            <Link href="/prototype/curia" className="rounded-md px-3 py-2 hover:bg-[#F8F1F3]">Curia Register</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1460px] px-4 py-8 sm:px-7 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-[1460px] border-t border-[#E6DADC] px-4 py-6 text-xs text-[#6A5960] sm:px-7">
        Prototype only. No registration, document, authentication or payment information is transmitted or saved.
      </footer>
    </div>
  );
}

export function DemoHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0 max-w-3xl">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#890022]">{eyebrow}</div>
      <h1 className={ebGaramond.className + " text-[40px] font-medium leading-[1.08] text-[#1E1114] sm:text-[51px]"}>{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#68575D]">{description}</p>
    </div>
    {action}
  </header>;
}
export function DemoStat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className={card}><p className="text-xs font-medium text-[#6A5960]">{label}</p><p className={ebGaramond.className + " mt-1 text-3xl font-semibold tabular-nums"}>{value}</p>{note && <p className="mt-1 text-xs text-[#75666B]">{note}</p>}</div>;
}
export function DemoTag({ children, tone="neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones={neutral:"bg-[#F4EEF0] text-[#5F414A]",good:"bg-[#EAF5EF] text-[#246A4E]",warn:"bg-[#FFF3DA] text-[#856017]",bad:"bg-[#FBE8EA] text-[#9A293D]"};
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold "+tones[tone]}>{children}</span>;
}
export function DemoCardLink({ href, icon, title, description, foot }: { href: string; icon: "registration" | "parish" | "finance"; title: string; description: string; foot: string }) {
  const Icon = icon === "registration" ? Files : icon === "parish" ? ClipboardCheck : QrCode;
  return <Link href={href} className={card+" group flex min-h-[220px] flex-col justify-between transition hover:border-[#A76C7B] hover:shadow-md"}>
    <div><div className="mb-4 grid h-11 w-11 place-items-center rounded-md bg-[#F7EDF0] text-[#890022]"><Icon className="h-6 w-6"/></div>
      <h2 className={ebGaramond.className+" text-[29px] font-medium"}>{title}</h2><p className="mt-1 text-sm leading-6 text-[#6A5960]">{description}</p></div>
    <div className="mt-6 flex items-center justify-between border-t border-[#EEE5E8] pt-3 text-xs font-semibold text-[#890022]">{foot}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1"/></div>
  </Link>;
}
