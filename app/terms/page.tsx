import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export const metadata = {
  title: "Terms & Conditions | Liturgical Ministry Registry",
  description:
    "Terms and Conditions for use of the Liturgical Ministry Registry of the Commission on Worship and Liturgy – Diocese of Kalookan.",
};

export default function TermsPage() {
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
              <FileText className="h-3.5 w-3.5" />
              Terms
            </div>

            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Terms &amp; Conditions
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              These Terms &amp; Conditions govern access to and use of the
              Liturgical Ministry Registry and its certificate-verification
              services.
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
              <h2 className="text-base font-semibold">1. About the Registry</h2>
              <p className="mt-2 text-muted-foreground">
                The Liturgical Ministry Registry is maintained by the
                Commission on Worship and Liturgy – Diocese of Kalookan to
                support the administration of liturgical ministry records and
                related certificate services.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">2. Acceptance of Terms</h2>
              <p className="mt-2 text-muted-foreground">
                By accessing or using the Registry, you agree to use the
                service in accordance with these Terms &amp; Conditions and
                applicable laws and regulations.
              </p>
              <p className="mt-3 text-muted-foreground">
                Authorized administrative functions may be subject to
                additional instructions, policies, or access requirements
                established by the Commission.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                3. Public Certificate Verification
              </h2>
              <p className="mt-2 text-muted-foreground">
                The public verification function is provided to check whether
                certificate information corresponds with a record maintained by
                the Registry.
              </p>
              <p className="mt-3 text-muted-foreground">
                Verification results should not be interpreted as granting
                access to private Registry records or supporting documents.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                4. Authorized Administrative Use
              </h2>
              <p className="mt-2 text-muted-foreground">
                Administrative functions are intended only for individuals
                authorized by the Commission. Authorized users are responsible
                for protecting their access credentials and for using Registry
                information only for legitimate organizational purposes.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                5. Accuracy and Appropriate Use
              </h2>
              <p className="mt-2 text-muted-foreground">
                Information entered into the Registry should be accurate,
                relevant, and submitted for legitimate Registry purposes.
                Users must not knowingly submit false, misleading, fraudulent,
                or unauthorized information.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                6. Prohibited Activities
              </h2>
              <p className="mt-2 text-muted-foreground">
                Users must not misuse the Registry, attempt to gain
                unauthorized access, interfere with its operation, circumvent
                security controls, scrape or collect information for
                unauthorized purposes, or use verification information in a
                manner that violates applicable law or the rights of others.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                7. Certificates and Documents
              </h2>
              <p className="mt-2 text-muted-foreground">
                Certificates and related documents issued or made available
                through the Registry are intended for their stated
                ecclesial, administrative, or verification purposes. Users
                must not alter, forge, misrepresent, or fraudulently reproduce
                certificates or Registry records.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                8. Intellectual Property
              </h2>
              <p className="mt-2 text-muted-foreground">
                Unless otherwise indicated, the Registry interface, branding,
                designs, text, graphics, and software are controlled by or
                used with authorization by the Commission. Nothing in these
                Terms grants a user ownership of those materials.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                9. Availability and Changes
              </h2>
              <p className="mt-2 text-muted-foreground">
                The Commission may maintain, modify, suspend, or discontinue
                portions of the Registry when necessary for administration,
                security, maintenance, or other legitimate organizational
                purposes.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                10. Privacy
              </h2>
              <p className="mt-2 text-muted-foreground">
                Processing of personal information through the Registry is
                described in our{" "}
                <Link
                  href="/privacy"
                  className="font-medium underline underline-offset-2 hover:text-foreground"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                11. Suspension or Restriction
              </h2>
              <p className="mt-2 text-muted-foreground">
                Access to administrative or other restricted Registry
                functions may be suspended or restricted where reasonably
                necessary to protect the Registry, its users, personal
                information, records, or legitimate organizational interests.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">
                12. Applicable Law
              </h2>
              <p className="mt-2 text-muted-foreground">
                These Terms are intended to operate subject to applicable laws
                and regulations of the Republic of the Philippines.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">13. Changes to These Terms</h2>
              <p className="mt-2 text-muted-foreground">
                These Terms may be updated when the Registry, its services, or
                applicable organizational requirements change. Updated terms
                will be published on this page with an appropriate effective
                date.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">14. Contact</h2>
              <p className="mt-2 text-muted-foreground">
                Questions concerning these Terms may be directed to:
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
                    href="mailto:cowlkalookan2025@gmail.com"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    cowlkalookan2025@gmail.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </article>
      </main>

      <RegistryFooter label="Terms & Conditions" />
    </div>
  );
}