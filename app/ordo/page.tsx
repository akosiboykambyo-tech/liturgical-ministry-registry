import type { Metadata } from "next";
import { RegistryHeader } from "@/components/registry-header";
import { RegistryFooter } from "@/components/registry-footer";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { OrdoCalendar } from "@/components/ordo-calendar";

export const metadata: Metadata = {
  title: "The Ordo | Diocese of Kalookan",
  description: "Explore the design preview of the Diocese of Kalookan liturgical calendar, diocesan reference dates, and parish celebrations. Not an official published Ordo.",
  robots: { index: false, follow: false },
};

export default function OrdoPage() {
  return (
    <PublicMaintenanceGate>
      <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
        <RegistryHeader current="ordo" />
        <OrdoCalendar />
        <RegistryFooter />
      </div>
    </PublicMaintenanceGate>
  );
}
