import Link from "next/link";
import { ebGaramond } from "@/app/fonts";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

type ErrorAction = {
  href: string;
  label: string;
};

type PublicErrorPageProps = {
  status: "403" | "404";
  title: string;
  description: string;
  actions: readonly ErrorAction[];
};

/**
 * One shared public error layout: the regular diocesan header and footer,
 * with a centered message that keeps the burgundy left rule and serif title.
 * This is presentation only; authorization remains enforced by the caller.
 */
export function PublicErrorPage({
  status,
  title,
  description,
  actions,
}: PublicErrorPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF9F9] text-[#1E1114]">
      <RegistryHeader />

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[1120px] flex-1 items-center px-6 py-12 sm:px-8 sm:py-16 lg:px-0"
      >
        <section
          aria-labelledby="error-page-title"
          className="w-full max-w-[900px] border-l-[3px] border-[#970E24] py-1 pl-6 sm:pl-8"
        >
          <p className="text-sm font-semibold tracking-[0.02em] text-[#970E24]">
            {status}
          </p>

          <h1
            id="error-page-title"
            className={`${ebGaramond.className} mt-3 max-w-[850px] text-[clamp(2.25rem,5vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.02em]`}
          >
            {title}
          </h1>

          <p className="mt-5 max-w-[590px] text-[15px] leading-7 text-[#5F4A4F] sm:text-base">
            {description}
          </p>

          <nav aria-label="Error page actions" className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
            {actions.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-semibold text-[#970E24] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/30 focus-visible:ring-offset-4"
              >
                {label}
              </Link>
            ))}
          </nav>
        </section>
      </main>

      <RegistryFooter />
    </div>
  );
}
