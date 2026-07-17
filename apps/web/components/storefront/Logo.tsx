import Link from 'next/link';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-fg text-[11px] font-bold leading-none text-bg"
      >
        AI
      </span>
      <span className="font-display text-lg tracking-tight">Bazaar</span>
    </Link>
  );
}
