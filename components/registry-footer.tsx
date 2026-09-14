import Image from 'next/image';

export function RegistryFooter({ label = 'Public Verification Portal' }: { label?: string }) {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2.5 px-4 py-6 text-center sm:py-7">
        <Image
          src="/images/Asset_1.svg"
          alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship & Liturgy"
          width={200}
          height={80}
          className="h-14 w-auto sm:h-16 md:h-20"
        />
        <p className="text-xs text-muted-foreground">
          Liturgical Ministry Registry — {label}
        </p>
      </div>
    </footer>
  );
}
