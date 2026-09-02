import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Search, ArrowRight, Church } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background flex flex-col">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Church className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Liturgical Ministry Registry
              </p>
              <p className="text-xs text-muted-foreground">
                Central Verification System
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/verify"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search className="h-4 w-4" />
              Verify a Member
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin Portal
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground ring-1 ring-inset ring-primary/20">
            <ShieldCheck className="h-3 w-3" />
            Official Head Office Registry
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Liturgical Ministry
            <span className="block text-primary">Registry &amp; Verification</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
            A centralized database tracking verified members across the six
            standard liturgical ministries. Users can instantly confirm
            a member&apos;s standing through a secure public lookup or by scanning
            the QR code on an official certificate.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/verify"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors shadow-sm"
            >
              <Search className="h-4 w-4" />
              Search the Public Registry
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin Portal
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col items-center gap-3">
          <Image
            src="/images/Asset_1.svg"
            alt="Liturgical Ministry Registry"
            width={200}
            height={80}
            priority
            className="h-16 sm:h-20 md:h-24 w-auto"
          />
          <p className="text-xs text-muted-foreground text-center">
            Liturgical Ministry Registry — Authorized Head Office System
          </p>
        </div>
      </footer>
    </div>
  );
}
