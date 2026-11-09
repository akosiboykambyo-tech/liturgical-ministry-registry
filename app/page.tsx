import Link from "next/link";
import { ScanQrCode } from "@/components/phosphor-icons";
import { RegistryHeader } from "@/components/registry-header";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { RegistryFooter } from "@/components/registry-footer";
import { VerificationMemberCard } from "@/components/verification-member-card";
import { ebGaramond } from "@/app/fonts";

export default function Home() {
  return (
    <PublicMaintenanceGate>
      <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
      <RegistryHeader current="home" />

      <main>
        <section className="bg-[#890022] text-white">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-0 lg:py-20">
            <p className={`${ebGaramond.className} text-[26px] font-normal italic leading-tight text-[#F3C6D0] sm:text-[32px] lg:text-[36px]`}>
              Is this person a
            </p>
            <h1 className={`${ebGaramond.className} mt-1 max-w-[980px] text-[52px] font-medium not-italic leading-[0.95] tracking-[-0.035em] sm:text-[72px] lg:text-[100px]`}>
              registered liturgical minister?
            </h1>

            <p className="mt-8 max-w-[560px] text-[17px] leading-7 text-white/90 sm:text-[18px]">
              Type a name or Registry ID to see their ministry, their parish, and
              whether their registration is current.
            </p>

            <form action="/verify" method="get" className="mt-8 max-w-[760px]">
              <label htmlFor="home-registry-search" className="sr-only">
                Full name or Registry ID
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="home-registry-search"
                  name="uid"
                  type="search"
                  required
                  placeholder="Full name or Registry ID"
                  className="min-h-14 flex-1 rounded-[3px] border-0 bg-white px-5 text-[17px] text-[#1E1114] outline-none ring-0 placeholder:text-[#766D70] focus-visible:ring-2 focus-visible:ring-white/80 sm:min-h-[58px]"
                />
                <button
                  type="submit"
                  className="min-h-14 shrink-0 rounded-[3px] bg-[#3A0010] px-8 text-[16px] font-semibold text-white transition-colors hover:bg-[#26000a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 sm:min-h-[58px]"
                >
                  Look up
                </button>
              </div>
            </form>

            <div className="mt-4 max-w-[780px] space-y-2 text-[14px] leading-6">
              <p className="text-[#F3C6D0]">
                Registry IDs look like LMD-2026-0001.
              </p>
              <p className="flex items-start gap-2 text-white">
                <ScanQrCode className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span>
                  Have a certificate? <strong className="font-semibold">Scan its QR code</strong> with your phone&apos;s camera.
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#FBF9F9]">
          <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 py-16 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:px-0 lg:py-20">
            <div>
              <h2 className={`${ebGaramond.className} text-[34px] font-medium not-italic leading-tight sm:text-[44px]`}>
                What a result shows
              </h2>

              <p className="mt-6 max-w-[510px] text-[17px] leading-8 text-[#5F4A4F]">
                <span className={`${ebGaramond.className} float-left mr-3 mt-1 text-[68px] font-semibold not-italic leading-[0.72] text-[#970E24]`}>
                  T
                </span>
                he minister&apos;s name, the ministry they serve in, their parish,
                and the date their registration is valid until. A registered
                result means the person currently has at least one active
                ministry registration.
              </p>
            </div>

            <div>
              <p className={`${ebGaramond.className} mb-3 text-[18px] font-medium not-italic uppercase tracking-[0.12em] text-[#5F4A4F]`}>
                Example result
              </p>

              <div className="border border-[#E6DADC] bg-[#FBF9F9] shadow-[0_12px_24px_-20px_rgba(58,0,16,0.4)]">
                <VerificationMemberCard
                  member={{
                    id: "sample-member",
                    first_name: "Maria",
                    last_name: "Santos",
                    parish: "San Roque Cathedral Parish",
                    member_ministries: [
                      {
                        id: "sample-ministry",
                        ministry: "Ministry of Lectors and Commentators",
                        status: "Renewed",
                        expiration_date: "2027-10-14",
                      },
                    ],
                  }}
                  active
                />
              </div>

              <p className="mt-3 text-[14px] leading-5 text-[#7A6C70]">
                Example only. Search the registry above for a current record.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#3A0010] text-white">
          <div className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-0 lg:py-20">
            <div className="max-w-[590px]">
              <h2 className={`${ebGaramond.className} text-[38px] font-medium not-italic leading-tight sm:text-[44px]`}>
                If there is no result
              </h2>
              <p className="mt-5 text-[17px] leading-8 text-[#EBCDD5]">
                That does not always mean the person is not a minister. A
                registration may be recent, or the name may be spelled
                differently. Ask the commission first.
              </p>
              <p className={`${ebGaramond.className} mt-6 text-[24px] font-normal italic leading-8 text-white`}>
                Or write to{" "}
                <a
                  href="mailto:help@cowl-dok.online"
                  className="underline decoration-white/40 underline-offset-4 hover:decoration-white"
                >
                  help@cowl-dok.online
                </a>
              </p>
            </div>

            <figure className="overflow-hidden">
              <div className="aspect-[3/2] w-full">
                <img
                  src="/images/church-facade-placeholder.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-contain opacity-40"
                />
              </div>
            </figure>
          </div>
        </section>
      </main>

      <RegistryFooter />
      </div>
    </PublicMaintenanceGate>
  );
}
