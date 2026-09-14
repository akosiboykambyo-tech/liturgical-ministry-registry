import Link from 'next/link';
import { Church, Search, ShieldCheck } from 'lucide-react';

type RegistryHeaderProps = {
  current?: 'home' | 'verify';
};

export function RegistryHeader({ current }: RegistryHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3 rounded-md focus-ring"
          aria-label="Liturgical Ministry Registry home"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-[1.02] group-active:scale-[0.98]">
            <Church className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-semibold leading-tight sm:text-[15px]">
              Liturgical Ministry Registry
            </span>
            <span className="block truncate text-xs leading-5 text-muted-foreground">
              {current === 'verify' ? 'Public Verification' : 'Central Verification System'}
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/verify"
            aria-current={current === 'verify' ? 'page' : undefined}
            className={[
              'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-[transform,background-color,box-shadow] duration-150 focus-ring',
              current === 'verify'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md active:scale-[0.98]',
            ].join(' ')}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Verify a Member</span>
            <span className="sm:hidden">Verify</span>
          </Link>
          <Link
            href="/admin"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-[transform,background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-sm active:scale-[0.98] focus-ring sm:px-3.5"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Admin Portal</span>
            <span className="sm:hidden">Admin</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
