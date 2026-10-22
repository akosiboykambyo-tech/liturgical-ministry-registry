"use client";

import { cn } from "@/lib/utils";
import type { MemberStatus } from "@/lib/constants";
import { getExpirationStatus, type ExpirationStatus } from "@/lib/constants";
import { CheckCircle2, Clock, XCircle, RefreshCw, AlertTriangle, CalendarClock } from "lucide-react";

const EXPIRATION_CONFIG: Record<
  Exclude<ExpirationStatus, "none">,
  { label: string; className: string; icon: typeof CalendarClock }
> = {
  valid: {
    label: "Valid",
    className: "bg-[#E5F1EF] text-[#0B5C5A] ring-[#0B5C5A]/25",
    icon: CheckCircle2,
  },
  expiring_soon: {
    label: "Expiring Soon",
    className: "bg-[#FFF4DC] text-[#7A4E00] ring-[#7A4E00]/25",
    icon: CalendarClock,
  },
  expired: {
    label: "Expired",
    className: "bg-red-100 text-red-800 ring-red-600/20",
    icon: AlertTriangle,
  },
};

const CONFIG: Record<
  MemberStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  New: {
    label: "Verified Active",
    className: "bg-[#E5F1EF] text-[#0B5C5A] ring-[#0B5C5A]/25",
    icon: CheckCircle2,
  },
  Renewed: {
    label: "Renewed (Validated)",
    className: "bg-[#E8F0FA] text-[#3B5278] ring-[#3B5278]/25",
    icon: RefreshCw,
  },
  "Pending Verification": {
    label: "Pending Verification",
    className: "bg-[#FFF4DC] text-[#7A4E00] ring-[#7A4E00]/30",
    icon: Clock,
  },
  Inactive: {
    label: "Inactive",
    className: "bg-[#F0EFEF] text-[#71666A] ring-[#71666A]/30",
    icon: XCircle,
  },
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
  expirationDate,
}: {
  status: MemberStatus;
  className?: string;
  showIcon?: boolean;
  expirationDate?: string | null;
}) {
  const cfg = CONFIG[status] ?? CONFIG["Pending Verification"];
  const Icon = cfg.icon;

  const expStatus = getExpirationStatus(expirationDate ?? null);
  const expCfg =
    expStatus !== "none" && expStatus !== "valid"
      ? EXPIRATION_CONFIG[expStatus]
      : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset whitespace-nowrap",
          cfg.className,
          className
        )}
      >
        {showIcon && <Icon className="h-3 w-3" />}
        {cfg.label}
      </span>
      {expCfg && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset whitespace-nowrap",
            expCfg.className
          )}
        >
          <expCfg.icon className="h-3 w-3" />
          {expCfg.label}
        </span>
      )}
    </span>
  );
}
