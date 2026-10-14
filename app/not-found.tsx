import Link from "next/link";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";
import { ebGaramond } from "@/app/fonts";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <RegistryHeader />

      <main className="mx-auto w-full max-w-[980px] px-5 py-16 sm:px-7 sm:py-20 lg:px-12 lg:py-24">
        <div className="border-l-4 border-[#970e24] pl-6 sm:pl-8">
          <p className="text-sm font-semibold text-[#970e24]">404</p>

          <h1
            className={`${ebGaramond.className} mt-3 max-w-2xl text-4xl font-medium leading-tight tracking-[-0.02em] sm:text-5xl`}
          >
            Sorry, we can&apos;t find that page.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            The link may be old, or the address may have been entered incorrectly.
          </p>

          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            If you were looking for a minister&apos;s record, you can search the
            registry instead.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
            <Link
              href="/"
              className="text-[#970e24] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-4"
            >
              Back to home
            </Link>

            <Link
              href="/verify"
              className="text-[#970e24] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-4"
            >
              Check a minister
            </Link>
          </div>
        </div>
      </main>

      <RegistryFooter />
    </div>
  );
}
