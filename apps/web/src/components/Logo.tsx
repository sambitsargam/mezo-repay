export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="rgb(var(--ink))" />
        <path d="M9 21.5V10.5h6.2a4 4 0 0 1 0 8H9" fill="none" stroke="rgb(var(--ivory))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 18.5 22 23" fill="none" stroke="rgb(var(--copper))" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Mezo <span className="text-copper-deep">RePay</span>
      </span>
    </span>
  );
}
