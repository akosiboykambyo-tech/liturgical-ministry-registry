import Link from "next/link";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { ebGaramond } from "@/app/fonts";

export default function MaintenancePage() {
  return (
    <PublicMaintenanceGate>
      <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
        <main className="mx-auto w-full max-w-[760px] px-6 py-20 sm:px-8">
          <h1 className={`${ebGaramond.className} text-[44px] font-medium`}>
            Maintenance mode is off.
          </h1>
          <p className="mt-4 text-[17px] leading-8 text-[#5F4A4F]">
            The public registry is available normally.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block font-semibold text-[#0B5C5A] underline underline-offset-3"
          >
            Back to the registry
          </Link>
        </main>
      </div>
    </PublicMaintenanceGate>
  );
}
