import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LandingVerificationHero } from "@/components/landing-verification-hero";
import { RegistryHeader } from "@/components/registry-header";
import { RegistryFooter } from "@/components/registry-footer";
import { ebGaramond } from "@/app/fonts";

const verificationSteps = [
  {
    number: "01",
    title: "Find the member",
    text: "Enter a full name or Registry ID in the official verification portal.",
  },
  {
    number: "02",
    title: "Review the record",
    text: "Check the member’s standing and registered ministry against the Head Office record.",
  },
  {
    number: "03",
    title: "Confirm the identity",
    text: "Use the exact Registry ID or certificate QR code for official verification.",
  },
];

export default function Home() {
  return (
    <div id="smooth-wrapper">
      <div
        id="smooth-content"
        className="min-h-screen bg-background text-foreground"
      >
        <RegistryHeader current="home" />

        <main>
        <LandingVerificationHero displayFontClassName={ebGaramond.className} />

        <section
          id="how-it-works"
          className="mx-auto w-full max-w-[1240px] px-5 pb-14 sm:px-7 lg:px-12 lg:pb-16"
        >
          <div
            data-landing-reveal="section-title"
            className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#970e24]">
                A simple, reliable check
              </p>
              <h2
                className={`${ebGaramond.className} mt-2 text-3xl font-medium tracking-tight sm:text-4xl`}
              >
                How verification works
              </h2>
            </div>

            <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-right">
              From a name to a confirmed record, in three straightforward steps.
            </p>
          </div>

          <ol className="mt-8 grid gap-7 md:grid-cols-3">
            {verificationSteps.map((step) => (
              <li
                key={step.number}
                data-landing-reveal="step"
                className="flex gap-5 border-t-2 border-[#970e24] pt-5"
              >
                <span
                  className={`${ebGaramond.className} text-3xl text-[#970e24]`}
                >
                  {step.number}
                </span>
                <div>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid w-full max-w-[1240px] gap-8 border-t border-border px-5 py-12 sm:px-7 lg:grid-cols-[0.9fr_1.3fr] lg:gap-16 lg:px-12 lg:py-16">
          <div data-landing-reveal="guidance-title">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#970e24]">
              Before you verify
            </p>
            <h2
              className={`${ebGaramond.className} mt-2 text-3xl font-medium tracking-tight`}
            >
              A little guidance
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
              For parish priests, ministry coordinators, and those checking a
              member&apos;s credentials.
            </p>
          </div>

          <div>
            <details
              data-landing-reveal="question"
              className="border-b border-border py-5 first:pt-0"
            >
              <summary className="cursor-pointer font-semibold leading-6 transition-colors hover:text-[#970e24]">
                Which is more precise: a name or a Registry ID?
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                A full name helps locate a member. An exact Registry ID
                distinguishes the record when names are similar. Check that the
                identity matches the certificate you are reviewing.
              </p>
            </details>

            <details
              data-landing-reveal="question"
              className="border-b border-border py-5"
            >
              <summary className="cursor-pointer font-semibold leading-6 transition-colors hover:text-[#970e24]">
                How do I verify an official certificate?
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Use your phone&apos;s camera to scan the certificate&apos;s QR code.
                It opens the linked registry record so you can review the
                member&apos;s identity, ministry, and standing.
              </p>
            </details>

            <details
              data-landing-reveal="question"
              className="border-b border-border py-5"
            >
              <summary className="cursor-pointer font-semibold leading-6 transition-colors hover:text-[#970e24]">
                Where do Head Office staff manage records?
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Authorized staff can access the{" "}
                <Link
                  href="/admin"
                  className="font-medium text-[#970e24] underline-offset-4 hover:underline"
                >
                  Admin Portal
                </Link>{" "}
                to manage registry records and certificates.
              </p>
            </details>
          </div>
        </section>

        <section className="bg-[#730a1c] text-white">
          <div
            data-landing-reveal="office"
            className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-5 py-9 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-12"
          >
            <div>
              <h2
                className={`${ebGaramond.className} text-3xl font-medium`}
              >
                Head Office staff
              </h2>
              <p className="mt-2 text-sm text-white/80">
                Sign in to manage ministry records.
              </p>
            </div>

            <Link
              href="/admin"
              className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#730a1c] transition-colors hover:bg-[#f9e7eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#730a1c]"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Admin Portal
            </Link>
          </div>
        </section>
        </main>

        <RegistryFooter label="Authorized Head Office System" />
      </div>
    </div>
  );
}