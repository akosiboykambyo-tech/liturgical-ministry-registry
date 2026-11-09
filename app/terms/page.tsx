import Link from "next/link";
import { ArrowLeft } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export const metadata = {
  title: "Terms & Conditions | Liturgical Ministry Registry",
  description:
    "Terms and Conditions for use of the Liturgical Ministry Registry of the Commission on Worship and Liturgy – Diocese of Kalookan.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
      <RegistryHeader />
      <main>
        <header className="bg-[#890022] text-white">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-0">
            <p className="text-[12px] font-semibold tracking-[0.18em] text-[#F3C6D0]">
              — TERMS & CONDITIONS
            </p>
            <h1 className={`${ebGaramond.className} mt-4 max-w-[920px] text-[50px] font-medium leading-[1.02] sm:text-[68px]`}>
              Terms & conditions.
            </h1>
            <p className="mt-5 max-w-[720px] text-[16px] leading-8 text-white/90 sm:text-[17px]">
              These Terms & Conditions govern access to and use of the Liturgical Ministry Registry and its certificate-verification services.
            </p>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-8 sm:py-12 lg:px-0">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#E6DADC] pb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5F4A4F] hover:text-[#970E24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/30"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Registry
            </Link>
            <p className="text-[13px] text-[#5F4A4F]">
              Effective date: <time dateTime="2026-10-19">19 October 2026</time>
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] lg:gap-14">
            <article className="min-w-0">
              <div className="space-y-9 text-[16px] leading-8">

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>1. About the Registry</h2>
              <p className="mt-3 text-[#5F4A4F]">
                The Liturgical Ministry Registry is maintained by the
                Commission on Worship and Liturgy – Diocese of Kalookan to
                support the administration of liturgical ministry records and
                related certificate services.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>2. Acceptance of Terms</h2>
              <p className="mt-3 text-[#5F4A4F]">
                By accessing or using the Registry, you agree to use the
                service in accordance with these Terms &amp; Conditions and
                applicable laws and regulations.
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                Authorized administrative functions may be subject to
                additional instructions, policies, or access requirements
                established by the Commission.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                3. Public Certificate Verification
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                The public verification function is provided to check whether
                certificate information corresponds with a record maintained by
                the Registry.
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                Verification results should not be interpreted as granting
                access to private Registry records or supporting documents.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                4. Authorized Administrative Use
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Administrative functions are intended only for individuals
                authorized by the Commission. Authorized users are responsible
                for protecting their access credentials and for using Registry
                information only for legitimate organizational purposes.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                5. Accuracy and Appropriate Use
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Information entered into the Registry should be accurate,
                relevant, and submitted for legitimate Registry purposes.
                Users must not knowingly submit false, misleading, fraudulent,
                or unauthorized information.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                6. Prohibited Activities
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Users must not misuse the Registry, attempt to gain
                unauthorized access, interfere with its operation, circumvent
                security controls, scrape or collect information for
                unauthorized purposes, or use verification information in a
                manner that violates applicable law or the rights of others.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                7. Certificates and Documents
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Certificates and related documents issued or made available
                through the Registry are intended for their stated
                ecclesial, administrative, or verification purposes. Users
                must not alter, forge, misrepresent, or fraudulently reproduce
                certificates or Registry records.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                8. Intellectual Property
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Unless otherwise indicated, the Registry interface, branding,
                designs, text, graphics, and software are controlled by or
                used with authorization by the Commission. Nothing in these
                Terms grants a user ownership of those materials.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                9. Availability and Changes
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                The Commission may maintain, modify, suspend, or discontinue
                portions of the Registry when necessary for administration,
                security, maintenance, or other legitimate organizational
                purposes.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                10. Privacy
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Processing of personal information through the Registry is
                described in our{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-[#0B5C5A] underline underline-offset-4 hover:text-[#970E24]"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                11. Suspension or Restriction
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Access to administrative or other restricted Registry
                functions may be suspended or restricted where reasonably
                necessary to protect the Registry, its users, personal
                information, records, or legitimate organizational interests.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                12. Applicable Law
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                These Terms are intended to operate subject to applicable laws
                and regulations of the Republic of the Philippines.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>13. Changes to These Terms</h2>
              <p className="mt-3 text-[#5F4A4F]">
                These Terms may be updated when the Registry, its services, or
                applicable organizational requirements change. Updated terms
                will be published on this page with an appropriate effective
                date.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>14. Contact</h2>
              <p className="mt-3 text-[#5F4A4F]">
                Questions concerning these Terms may be directed to:
              </p>
              <div className="mt-5 border-l-2 border-[#970E24] pl-5 text-[15px] leading-7">
                <p className="font-semibold text-[#25171B]">
                  Commission on Worship and Liturgy – Diocese of Kalookan
                </p>
                <p className="mt-1 text-[#5F4A4F]">
                  2F San Roque Compound, A. Mabini St. cor. 10th Ave.,
                  <br />
                  Poblacion, Caloocan City 1400
                </p>
                <p className="mt-1 text-[#5F4A4F]">
                  <a
                    href="mailto:help@cowl-dok.online"
                    className="font-medium text-[#0B5C5A] underline underline-offset-4 hover:text-[#970E24]"
                  >
                    help@cowl-dok.online
                  </a>
                </p>
              </div>
            </section>

              </div>
            </article>

            <aside aria-label="Commission contact details" className="self-start border-t-2 border-[#970E24] pt-5 lg:sticky lg:top-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#970E24]">
                Commission office
              </p>
              <h2 className={`${ebGaramond.className} mt-3 text-[27px] font-medium leading-tight text-[#25171B]`}>
                Commission on Worship and Liturgy
              </h2>
              <p className="mt-1 text-[14px] text-[#5F4A4F]">Diocese of Kalookan</p>
              <address className="mt-5 not-italic text-[14px] leading-7 text-[#5F4A4F]">
                2F San Roque Compound, A. Mabini St. cor. 10th Ave.,
                <span className="block">Poblacion, Caloocan City 1400</span>
              </address>
              <a
                href="mailto:help@cowl-dok.online"
                className="mt-4 inline-block break-all text-[14px] font-semibold text-[#0B5C5A] underline underline-offset-4 hover:text-[#970E24]"
              >
                help@cowl-dok.online
              </a>
            </aside>
          </div>
        </div>
      </main>
      <RegistryFooter label="Terms & Conditions" />
    </div>
  );
}
