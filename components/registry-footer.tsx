import Link from "next/link";

export function RegistryFooter({
  label = "Public Verification Portal",
}: {
  label?: string;
}) {
  void label;

  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 py-8 sm:px-7 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="max-w-xl">
          <p className="text-sm font-semibold">Liturgical Ministry Registry</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Diocesan Commission on Worship and Liturgy - Diocese of Kalookan
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Questions or can&apos;t find a minister? Email us at{" "}
            <a
              href="mailto:cowlkalookan2025@gmail.com"
              className="font-medium text-[#970e24] underline-offset-4 hover:underline"
            >
              cowlkalookan2025@gmail.com
            </a>
          </p>
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