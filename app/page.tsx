import Link from 'next/link';
import { ShieldCheck, Search, ArrowRight, CheckCircle2, QrCode } from 'lucide-react';
import { RegistryHeader } from '@/components/registry-header';
import { RegistryFooter } from '@/components/registry-footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background flex flex-col animate-page-in">
      <RegistryHeader current="home" />

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-6xl items-center px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <div className="mx-auto w-full max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground ring-1 ring-inset ring-primary/20">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Official Head Office Registry
            </span>

            <h1 className="mt-5 text-[clamp(2.5rem,8vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground sm:mt-6">
              Liturgical Ministry
              <span className="mt-1 block text-primary">Registry &amp; Verification</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8">
              A centralized registry for verifying registered liturgical ministers
              across the six standard ministries.
              <span className="hidden sm:inline"> Confirm a member&apos;s standing through a public lookup or the QR code on an official certificate.</span>
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:justify-center">
              <Link
                href="/verify"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm transition-[transform,background-color,box-shadow] duration-150 hover:bg-foreground/90 hover:shadow-md active:scale-[0.98] focus-ring"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Search the Public Registry
                <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                href="/admin"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-[transform,background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-sm active:scale-[0.98] focus-ring"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Admin Portal
              </Link>
            </div>

            <div className="mx-auto mt-10 max-w-2xl border-t border-border/70 pt-6 sm:mt-12">
              <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3 sm:gap-5">
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold">Official registry</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Head Office records</p>
                </div>

                <div className="flex flex-col items-center">
                  <Search className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold">Public verification</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Search by name or ID</p>
                </div>

                <div className="flex flex-col items-center">
                  <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold">QR-enabled</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Verify official certificates</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border/70 bg-muted/25">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                Public verification
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                How verification works
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Confirm a registered liturgical minister through the official diocesan registry.
              </p>
            </div>

            <ol className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
              <li className="rounded-xl border border-border/70 bg-background p-5 shadow-sm">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold text-foreground">Search</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Look up a member by name or Registry ID.
                </p>
              </li>
              <li className="rounded-xl border border-border/70 bg-background p-5 shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold text-foreground">Confirm</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Review the member&apos;s standing and registered ministry.
                </p>
              </li>
              <li className="rounded-xl border border-border/70 bg-background p-5 shadow-sm">
                <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold text-foreground">Verify</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use an exact Registry ID or certificate QR code for official verification.
                </p>
              </li>
            </ol>
          </div>
        </section>
      </main>

      <RegistryFooter label="Authorized Head Office System" />
    </div>
  );
}
