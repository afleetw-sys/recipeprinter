// RecipePrinter's own mark, a printer/page glyph in CookPilot's blue→teal
// palette so it sits beside CookPilot as a sibling, not a clone of its logo.
export function LogoMark({ size = 30, rounded = 12 }: { size?: number; rounded?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="rp-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#009bfa" />
          <stop offset="1" stopColor="#60cac4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx={rounded} fill="url(#rp-mark)" />
      {/* printer body + paper */}
      <rect x="9" y="6" width="14" height="7" rx="1.5" fill="white" opacity="0.95" />
      <rect x="7.5" y="12.5" width="17" height="9" rx="2.5" fill="white" />
      <rect x="11" y="19" width="10" height="7" rx="1.5" fill="white" opacity="0.95" />
      <line x1="13" y1="22" x2="19" y2="22" stroke="#009bfa" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="13" y1="24" x2="17.5" y2="24" stroke="#60cac4" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="20.5" cy="16" r="1.1" fill="#009bfa" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[-0.04em] ${className}`}>
      Recipe<span className="text-brand">Printer</span>
    </span>
  );
}
