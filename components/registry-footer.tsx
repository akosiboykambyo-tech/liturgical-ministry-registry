import Link from "next/link";
import { ebGaramond } from "@/app/fonts";

export function RegistryFooter({
  label: _label,
}: {
  label?: string;
}) {
  return (
    <footer className="bg-[#FBF9F9] text-[#1E1114]">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-6 py-8 sm:px-8 md:flex-row md:items-start md:justify-between lg:px-0">
        <div>
          <p className={`${ebGaramond.className} text-[18px] font-semibold not-italic leading-6`}>
            Liturgical Ministry Registry
          </p>
          <p className="mt-1 text-[13px] leading-5 text-[#5F4A4F]">
            Diocesan Commission on Worship and Liturgy, Diocese of Kalookan
          </p>
          <p className="mt-1 text-[13px] leading-5 text-[#5F4A4F]">
            Questions:{" "}
            <a
              href="mailto:help@cowl-dok.online"
              className="underline underline-offset-3 hover:text-[#970E24]"
            >
              help@cowl-dok.online
            </a>
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-7 gap-y-3 text-[13px] text-[#5F4A4F]"
        >
          <Link href="/privacy" className="underline underline-offset-3 hover:text-[#970E24]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="underline underline-offset-3 hover:text-[#970E24]">
            Terms &amp; Conditions
          </Link>
          <Link href="/admin" className="underline underline-offset-3 hover:text-[#970E24]">
            Admin sign-in
          </Link>
        </nav>
      </div>
    </footer>
  );
}