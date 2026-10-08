import Image from "next/image";
import Link from "next/link";

export function RegistryFooter({
  label = "Public Verification Portal",
}: {
  label?: string;
}) {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 py-8 sm:px-7 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex items-center gap-5">
          <Image
            src="/images/Asset_1.svg"
            alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship & Liturgy"
            width={210}
            height={72}
            className="h-auto w-[145px] sm:w-[180px] lg:w-[210px]"
          />
          <div>
            <p className="text-sm font-semibold">Liturgical Ministry Registry</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        </div>

        <nav
          aria-label="Legal"
          className="flex w-full items-center justify-center gap-5 text-center text-sm text-muted-foreground md:w-auto md:text-left"
        >
          <Link
            href="/privacy"
            className="underline-offset-4 transition-colors hover:text-[#970e24] hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="underline-offset-4 transition-colors hover:text-[#970e24] hover:underline"
          >
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
