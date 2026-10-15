import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export const metadata = {
  title: "Privacy Policy | Liturgical Ministry Registry",
  description:
    "Privacy Policy for the Liturgical Ministry Registry of the Commission on Worship and Liturgy – Diocese of Kalookan.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <RegistryHeader />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Registry
        </Link>

        <article className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8 md:p-10">
          <div className="mb-8 border-b border-border pb-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacy
            </div>

            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Privacy Policy
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This Privacy Policy explains how the Liturgical Ministry Registry
              collects, uses, protects, retains, and discloses personal
              information in connection with its services.
            </p>

            <div className="mt-5 rounded-lg bg-muted/40 p-4 text-sm leading-6">
              <p className="font-medium">
                Commission on Worship and Liturgy – Diocese of Kalookan
              </p>
              <p className="text-muted-foreground">
                2F San Roque Compound, A. Mabini St. cor. 10th Ave.,
                <br />
                Poblacion, Caloocan City 1400
                <br />
                Email:{" "}
                <a
                  href="mailto:cowlkalookan2025@gmail.com"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  cowlkalookan2025@gmail.com
                </a>
              </p>
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              Effective Date: To be confirmed by the Commission
            </p>
          </div>

          <div className="space-y-9 text-sm leading-7">
            <section>
              <h2 className="text-base font-semibold">1. Introduction</h2>
              <p className="mt-2 text-muted-foreground">
                The Commission on Worship and Liturgy – Diocese of Kalookan
                (“the Commission,” “we,” “us,” or “our”) respects the privacy
                of individuals whose personal information is processed through
                the Liturgical Ministry Registry (“Registry”).
              </p>
              <p className="mt-3 text-muted-foreground">
                This Policy is intended to explain, in clear language, the
                information processed by the Registry, the purposes for which
                it is processed, how it may be disclosed, how it is protected,
                and the rights available to data subjects.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                2. Information We Process
              </h2>
              <p className="mt-2 text-muted-foreground">
                Depending on the Registry function being used, information may
                include:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
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

            <section>
              <h2 className="text-base font-semibold">
                3. Purposes of Processing
              </h2>
              <p className="mt-2 text-muted-foreground">
                Personal information may be processed for legitimate Registry
                purposes, including maintaining ministry records, administering
                certificates, verifying certificates, managing authorized
                Registry access, maintaining audit records, and protecting the
                integrity and security of the Registry.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                4. Lawful Processing
              </h2>
              <p className="mt-2 text-muted-foreground">
                Personal information will be processed only when permitted
                under applicable law and on an appropriate lawful basis. Where
                consent is the applicable basis, it may be requested and
                managed in accordance with applicable privacy requirements.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                5. Certificate Verification
              </h2>
              <p className="mt-2 text-muted-foreground">
                The Registry provides a public certificate-verification
                function. Information displayed through that function is
                limited to information intended for verification and
                authentication purposes. Public verification does not provide
                general access to private administrative records or supporting
                documents.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                6. Disclosure and Data Sharing
              </h2>
              <p className="mt-2 text-muted-foreground">
                Access to personal information is limited to authorized
                persons and service providers where access is necessary for
                legitimate Registry operations, subject to applicable
                confidentiality and data-protection requirements.
              </p>
              <p className="mt-3 text-muted-foreground">
                Information may also be disclosed when required or permitted
                by applicable law or when necessary to establish, exercise, or
                defend legal rights.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                7. Retention and Disposal
              </h2>
              <p className="mt-2 text-muted-foreground">
                Personal information will be retained only for as long as
                necessary for the declared and legitimate purposes for which it
                was collected, for applicable legal or organizational
                requirements, or for the establishment, exercise, or defense of
                legal claims.
              </p>
              <p className="mt-3 text-muted-foreground">
                When information is no longer required, it should be securely
                disposed of or otherwise handled in accordance with applicable
                privacy and records-management requirements.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                8. Security of Personal Information
              </h2>
              <p className="mt-2 text-muted-foreground">
                Appropriate organizational, physical, and technical safeguards
                are to be maintained to protect personal information against
                unauthorized access, disclosure, alteration, loss, destruction,
                or other unlawful processing.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                9. Your Data Privacy Rights
              </h2>
              <p className="mt-2 text-muted-foreground">
                Subject to applicable law and any relevant limitations, data
                subjects may have rights including the right to be informed,
                the right to access personal information, the right to correct
                inaccurate information, and the right to object to or otherwise
                exercise applicable rights concerning processing.
              </p>
              <p className="mt-3 text-muted-foreground">
                Requests concerning personal information may be directed to
                the Commission using the contact information provided in this
                Policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                10. Accuracy of Information
              </h2>
              <p className="mt-2 text-muted-foreground">
                The Commission seeks to maintain personal information that is
                accurate, relevant, and appropriate for the purposes for which
                it is processed. If you believe information about you is
                inaccurate or incomplete, please contact the Commission so the
                matter can be reviewed.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                11. Changes to This Policy
              </h2>
              <p className="mt-2 text-muted-foreground">
                This Privacy Policy may be updated when Registry practices,
                applicable requirements, or organizational policies change.
                Material changes should be communicated through appropriate
                means and reflected on this page.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">12. Contact Us</h2>
              <p className="mt-2 text-muted-foreground">
                For privacy questions, requests, or concerns relating to the
                Liturgical Ministry Registry, contact:
              </p>
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4">
                <p className="font-medium">
                  Commission on Worship and Liturgy – Diocese of Kalookan
                </p>
                <p className="mt-1 text-muted-foreground">
                  2F San Roque Compound, A. Mabini St. cor. 10th Ave.,
                  <br />
                  Poblacion, Caloocan City 1400
                </p>
                <p className="mt-1 text-muted-foreground">
                  <a
                    href="mailto:help@cowl-dok.online"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    help@cowl-dok.online
                  </a>
                </p>
              </div>
            </section>
          </div>
        </article>
      </main>

      <RegistryFooter label="Privacy Policy" />
    </div>
  );
}