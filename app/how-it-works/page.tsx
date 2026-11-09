import Link from "next/link";
import { Check, Clock, MinusCircle } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export default function HowItWorksPage() {
  return (
    <PublicMaintenanceGate>
      <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
        <RegistryHeader />

        <main>
          <section className="bg-[#890022] text-white">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 lg:px-0 lg:py-18">
              <p className={`${ebGaramond.className} text-[28px] font-normal italic text-[#F3C6D0] sm:text-[34px]`}>
                Two ways to check
              </p>
              <h1 className={`${ebGaramond.className} mt-1 max-w-[850px] text-[52px] font-medium leading-[0.98] tracking-[-0.03em] sm:text-[70px]`}>
                How the registry works
              </h1>
              <p className="mt-6 max-w-[650px] text-[17px] leading-8 text-white/90">
                Look up a liturgical minister by name or Registry ID, or scan the
                QR code on an official certificate.
              </p>
            </div>
          </section>

          <section>
            <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 py-14 sm:px-8 lg:grid-cols-2 lg:px-0 lg:py-18">
              <div className="border-t-[4px] border-[#970E24] pt-6">
                <h2 className={`${ebGaramond.className} text-[36px] font-medium sm:text-[44px]`}>
                  By name or Registry ID
                </h2>
                <p className="mt-4 text-[17px] leading-8 text-[#5F4A4F]">
                  Use a full name when you want to find a person. Use the exact
                  Registry ID when you need the most precise result or need an
                  available certificate.
                </p>
                <Link
                  href="/verify"
                  className="mt-6 inline-flex min-h-12 items-center rounded-[3px] bg-[#970E24] px-6 text-[15px] font-semibold text-white"
                >
                  Look up a minister
                </Link>
              </div>

              <div className="border-t-[4px] border-[#970E24] pt-6">
                <h2 className={`${ebGaramond.className} text-[36px] font-medium sm:text-[44px]`}>
                  By certificate QR code
                </h2>
                <p className="mt-4 text-[17px] leading-8 text-[#5F4A4F]">
                  Open your phone camera and scan the QR code printed on the
                  certificate. It opens the linked registry record directly.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 lg:px-0 lg:py-18">
              <h2 className={`${ebGaramond.className} text-[38px] font-medium sm:text-[44px]`}>
                How to read a result
              </h2>

              <div className="mt-7 border-t border-[#E6DADC]">
                <div className="grid gap-3 border-b border-[#E6DADC] py-5 md:grid-cols-[250px_1fr]">
                  <div className="flex items-center gap-3 font-semibold text-[#0B5C5A]">
                    <Check className="h-5 w-5" />
                    Registered
                  </div>
                  <p className="text-[16px] leading-7 text-[#5F4A4F]">
                    Registration is current for at least one ministry.
                  </p>
                </div>
                <div className="grid gap-3 border-b border-[#E6DADC] py-5 md:grid-cols-[250px_1fr]">
                  <div className="flex items-center gap-3 font-semibold text-[#3B5278]">
                    <Clock className="h-5 w-5" />
                    Pending review
                  </div>
                  <p className="text-[16px] leading-7 text-[#5F4A4F]">
                    The registration is being reviewed or the Commission is
                    waiting for more information. It is not active yet.
                  </p>
                </div>
                <div className="grid gap-3 border-b border-[#E6DADC] py-5 md:grid-cols-[250px_1fr]">
                  <div className="flex items-center gap-3 font-semibold text-[#7A4E00]">
                    <Clock className="h-5 w-5" />
                    Registration ended [date]
                  </div>
                  <p className="text-[16px] leading-7 text-[#5F4A4F]">
                    The registration period has finished.
                  </p>
                </div>
                <div className="grid gap-3 border-b border-[#E6DADC] py-5 md:grid-cols-[250px_1fr]">
                  <div className="flex items-center gap-3 font-semibold text-[#5F4A4F]">
                    <MinusCircle className="h-5 w-5" />
                    Not currently active
                  </div>
                  <p className="text-[16px] leading-7 text-[#5F4A4F]">
                    There is no current registration for this ministry. Ask the
                    commission if you expected one.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[#3A0010] text-white">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-8 lg:px-0">
              <h2 className={`${ebGaramond.className} text-[34px] font-medium`}>
                What the registry does not show
              </h2>
              <p className="mt-4 max-w-[700px] text-[16px] leading-8 text-[#EBCDD5]">
                Public lookup is limited to names, parishes, ministries and
                public registration status. Personal contact details and internal
                reasons for a status are not shown.
              </p>
              <Link
                href="/report"
                className="mt-6 inline-flex min-h-12 items-center rounded-[3px] bg-white px-6 text-[15px] font-semibold text-[#3A0010]"
              >
                Report a concern
              </Link>
            </div>
          </section>
        </main>

        <RegistryFooter />
      </div>
    </PublicMaintenanceGate>
  );
}
