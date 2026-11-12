import type { ReactNode } from "react";
import Link from "next/link";
import { ebGaramond } from "@/app/fonts";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

type StatusAction = {
  href: string;
  label: string;
};

type PublicStatusPageProps = {
  status: string;
  title: string;
  description: string;
  actions?: readonly StatusAction[];
  children?: ReactNode;
};

/**
 * Presentation-only public utility/error page.
 * Keeps branding and recovery actions consistent without changing access rules.
 */
export function PublicStatusPage({
  status,
  title,
  description,
  actions = [],
  children,
}: PublicStatusPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF9F9] text-[#1E1114]">
      <RegistryHeader />
      <main id="main-content" className="mx-auto flex w-full max-w-[1120px] flex-1 items-center px-6 py-12 sm:px-8 sm:py-16 lg:px-0">
        <section aria-labelledby="public-status-title" className="w-full max-w-[900px] border-l-[3px] border-[#970E24] py-1 pl-6 sm:pl-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#970E24]">
            {status}
          </p>
          <h1 id="public-status-title" className={ebGaramond.className + " mt-3 max-w-[850px] text-[clamp(2.25rem,5vw,3.5rem)] font-medium leading-[1.08] tracking-[-0.02em]"}>
            {title}
          </h1>
          <p className="mt-5 max-w-[640px] text-base leading-7 text-[#5F4A4F]">
            {description}
          </p>
          {(actions.length > 0 || children) && (
            <div className="mt-8 flex flex-wrap items-center gap-3" aria-label="Next steps">
              {children}
              {actions.map(action => (
                <Link
                  href={action.href}
                  key={action.href}
                  className="inline-flex min-h-11 items-center justify-center border border-[#E6DADC] bg-white px-5 py-2 text-sm font-semibold text-[#890022] transition-colors hover:border-[#970E24] hover:bg-[#FBF3F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <RegistryFooter />
    </div>
  );
}
