import Link from 'next/link';
import { ShieldCheck, Search, ArrowRight, CheckCircle2, QrCode } from 'lucide-react';
import { RegistryHeader } from '@/components/registry-header';
import { RegistryFooter } from '@/components/registry-footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background flex flex-col animate-page-in">
      <RegistryHeader current="home" />

      <main className="flex-1">
        <section className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-6xl items-center px-4 py-12 sm:px-6 sm:py-16 lg:min-h-[calc(100svh-9rem)] lg:py-20">
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

            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-3 border-t border-border/70 pt-6 text-left sm:mt-12 sm:grid-cols-3 sm:gap-5">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Official registry</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Head Office records</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Public verification</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Search by name or ID</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">QR-enabled</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Verify official certificates</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <RegistryFooter label="Authorized Head Office System" />
    </div>
  );
}
