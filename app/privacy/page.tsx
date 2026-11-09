import Link from "next/link";
import { ArrowLeft } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export const metadata = {
  title: "Privacy Policy | Liturgical Ministry Registry",
  description:
    "Privacy Policy for the Liturgical Ministry Registry of the Commission on Worship and Liturgy – Diocese of Kalookan.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
      <RegistryHeader />
      <main>
        <header className="bg-[#890022] text-white">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-0">
            <p className="text-[12px] font-semibold tracking-[0.18em] text-[#F3C6D0]">
              — PRIVACY POLICY
            </p>
            <h1 className={`${ebGaramond.className} mt-4 max-w-[920px] text-[50px] font-medium leading-[1.02] sm:text-[68px]`}>
              Your privacy matters.
            </h1>
            <p className="mt-5 max-w-[720px] text-[16px] leading-8 text-white/90 sm:text-[17px]">
              This Privacy Policy explains how the Liturgical Ministry Registry collects, uses, protects, retains, and discloses personal information in connection with its services.
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
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>1. Introduction</h2>
              <p className="mt-3 text-[#5F4A4F]">
                The Commission on Worship and Liturgy – Diocese of Kalookan
                (“the Commission,” “we,” “us,” or “our”) respects the privacy
                of individuals whose personal information is processed through
                the Liturgical Ministry Registry (“Registry”).
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                This Policy is intended to explain, in clear language, the
                information processed by the Registry, the purposes for which
                it is processed, how it may be disclosed, how it is protected,
                and the rights available to data subjects.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                2. Information We Process
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Depending on the Registry function being used, information may
                include:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-[#5F4A4F]">
                <li>First and last names;</li>
                <li>Parish affiliation;</li>
                <li>Liturgical ministry and service-year information;</li>
                <li>Registry identification numbers or UID information;</li>
                <li>Certificate and supporting-document information;</li>
                <li>Information relating to authorized signatories;</li>
                <li>Administrative and audit records; and</li>
                <li>
                  Information necessary to process certificate verification
                  and related requests.
                </li>
              </ul>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                3. Purposes of Processing
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Personal information may be processed for legitimate Registry
                purposes, including maintaining ministry records, administering
                certificates, verifying certificates, managing authorized
                Registry access, maintaining audit records, and protecting the
                integrity and security of the Registry.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                4. Lawful Processing
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Personal information will be processed only when permitted
                under applicable law and on an appropriate lawful basis. Where
                consent is the applicable basis, it may be requested and
                managed in accordance with applicable privacy requirements.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                5. Certificate Verification
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                The Registry provides a public certificate-verification
                function. Information displayed through that function is
                limited to information intended for verification and
                authentication purposes. Public verification does not provide
                general access to private administrative records or supporting
                documents.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                6. Disclosure and Data Sharing
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Access to personal information is limited to authorized
                persons and service providers where access is necessary for
                legitimate Registry operations, subject to applicable
                confidentiality and data-protection requirements.
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                Information may also be disclosed when required or permitted
                by applicable law or when necessary to establish, exercise, or
                defend legal rights.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                7. Retention and Disposal
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Personal information will be retained only for as long as
                necessary for the declared and legitimate purposes for which it
                was collected, for applicable legal or organizational
                requirements, or for the establishment, exercise, or defense of
                legal claims.
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                When information is no longer required, it should be securely
                disposed of or otherwise handled in accordance with applicable
                privacy and records-management requirements.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                8. Security of Personal Information
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Appropriate organizational, physical, and technical safeguards
                are to be maintained to protect personal information against
                unauthorized access, disclosure, alteration, loss, destruction,
                or other unlawful processing.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                9. Your Data Privacy Rights
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                Subject to applicable law and any relevant limitations, data
                subjects may have rights including the right to be informed,
                the right to access personal information, the right to correct
                inaccurate information, and the right to object to or otherwise
                exercise applicable rights concerning processing.
              </p>
              <p className="mt-3 text-[#5F4A4F]">
                Requests concerning personal information may be directed to
                the Commission using the contact information provided in this
                Policy.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                10. Accuracy of Information
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                The Commission seeks to maintain personal information that is
                accurate, relevant, and appropriate for the purposes for which
                it is processed. If you believe information about you is
                inaccurate or incomplete, please contact the Commission so the
                matter can be reviewed.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>
                11. Changes to This Policy
              </h2>
              <p className="mt-3 text-[#5F4A4F]">
                This Privacy Policy may be updated when Registry practices,
                applicable requirements, or organizational policies change.
                Material changes should be communicated through appropriate
                means and reflected on this page.
              </p>
            </section>

            <section className="border-b border-[#E6DADC] pb-9 last:border-b-0">
              <h2 className={`${ebGaramond.className} text-[27px] font-medium leading-tight text-[#25171B] sm:text-[30px]`}>12. Contact Us</h2>
              <p className="mt-3 text-[#5F4A4F]">
                For privacy questions, requests, or concerns relating to the
                Liturgical Ministry Registry, contact:
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
      <RegistryFooter label="Privacy Policy" />
    </div>
  );
}
