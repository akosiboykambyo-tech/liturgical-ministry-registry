import Link from "next/link";
import { ArrowRight, ScrollText, Settings, Users } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";

const ADMIN_LINKS = [
  {
    href: "/admin/audit",
    label: "Audit Trail",
    description: "Review recorded changes and administrative activity.",
    icon: ScrollText,
  },
  {
    href: "/admin/staff-access",
    label: "Staff and Access",
    description: "Invite staff, review approved roles, and manage Registry, COWL, and Curia access.",
    icon: Users,
  },
  {
    href: "/admin/site-settings",
    label: "Public Website Settings",
    description: "Manage the public-facing website configuration.",
    icon: Settings,
  },
];

export default function AdministrationPage() {
  return (
    <div className="space-y-6 pb-10 text-[#1E1114]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">SYSTEM MANAGEMENT</p>
        <h1 className={ebGaramond.className + " mt-1 text-[42px] font-medium leading-none sm:text-[48px]"}>Administration</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B5C62]">
          Manage system configuration, administrative records, and audit activity.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-[145px] items-start gap-3 border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 hover:bg-[#FBF3F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]"
            >
              <Icon className="mt-1 h-6 w-6 shrink-0 text-[#890022]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{item.label}</span>
                <span className="mt-2 block text-sm leading-6 text-[#6B5C62]">{item.description}</span>
              </span>
              <ArrowRight className="mt-1 h-5 w-5 text-[#890022] group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
