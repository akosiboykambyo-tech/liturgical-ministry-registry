import { Loader2 } from "@/components/phosphor-icons";
import { cn } from "@/lib/utils";

type CenteredAdminLoaderProps = {
  label?: string;
  fullscreen?: boolean;
  className?: string;
};

export function CenteredAdminLoader({
  label = "Loading…",
  fullscreen = false,
  className,
}: CenteredAdminLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full items-center justify-center bg-[#FBF9F9]",
        fullscreen
          ? "fixed inset-0 z-50 min-h-[100dvh]"
          : "min-h-[calc(100dvh-7rem)] lg:min-h-[calc(100dvh-4rem)]",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#890022] motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm font-medium text-[#5F4A4F]">{label}</span>
      </div>
    </div>
  );
}
