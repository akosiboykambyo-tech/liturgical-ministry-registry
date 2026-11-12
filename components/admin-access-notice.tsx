import type { ReactNode } from "react";
import { ebGaramond, inter } from "@/app/fonts";
import { ShieldCheck } from "@/components/phosphor-icons";

type AdminAccessNoticeProps = {
  title: string;
  description: string;
  children?: ReactNode;
  actions: ReactNode;
};

/** Shared visual language for blocked/pending admin access states.
 * This component is presentation only and never authorizes a user.
 */
export function AdminAccessNotice({
  title,
  description,
  children,
  actions,
}: AdminAccessNoticeProps) {
  return (
    <main className={inter.className + " flex min-h-screen items-center justify-center bg-[#FBF9F9] px-4 py-10 text-[#1E1114]"}>
      <section aria-labelledby="admin-access-title" className="w-full max-w-lg border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-6 sm:p-8">
        <ShieldCheck className="h-8 w-8 text-[#890022]" aria-hidden="true" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">
          COWL-DOK access
        </p>
        <h1 id="admin-access-title" className={ebGaramond.className + " mt-2 text-[38px] font-medium leading-tight"}>
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">{description}</p>
        {children}
        <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
      </section>
    </main>
  );
}

/** Min-height and keyboard focus state match the rest of the admin portal. */
export const adminAccessPrimaryAction =
  "inline-flex min-h-11 items-center justify-center bg-[#890022] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] disabled:opacity-50";

export const adminAccessSecondaryAction =
  "inline-flex min-h-11 items-center justify-center border border-[#D7CACC] bg-white px-5 py-2 text-sm font-semibold text-[#890022] transition-colors hover:border-[#970E24] hover:bg-[#FBF3F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]";
