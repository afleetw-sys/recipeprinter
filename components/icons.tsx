// Lightweight inline icons (RecipePrinter has no icon dependency). Stroke-based
// to echo the weight of CookPilot's Phosphor icons.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const LinkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 15l6-6" />
    <path d="M11 6l1-1a4 4 0 015.7 5.7l-2 2" />
    <path d="M13 18l-1 1a4 4 0 01-5.7-5.7l2-2" />
  </Base>
);

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="M21 16l-5-5L5 20" />
  </Base>
);

export const TextIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 5h14" />
    <path d="M5 10h14" />
    <path d="M5 15h9" />
    <path d="M5 20h6" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M16 16l4 4" />
  </Base>
);

export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
);

export const MoreVerticalIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </Base>
);

export const CookPilotLogoIcon = ({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/images/cookpilot-logo-bw.png"
    alt=""
    aria-hidden
    className={className}
    style={{ width: size, height: size, objectFit: "contain" }}
  />
);

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
  </Base>
);

export const PrintIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 9V3h10v6" />
    <path d="M7 19H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2" />
    <rect x="7" y="15" width="10" height="6" rx="1" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 13l4 4L19 7" />
  </Base>
);

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 0114-5.3L21 9" />
    <path d="M21 4v5h-5" />
    <path d="M20 12a8 8 0 01-14 5.3L3 15" />
    <path d="M3 20v-5h5" />
  </Base>
);

export const ExternalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 5h5v5" />
    <path d="M19 5l-7 7" />
    <path d="M19 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h4" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Base>
);

export const UsersIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" />
    <path d="M16 5.5a3.2 3.2 0 010 6" />
    <path d="M17 14.5a5.5 5.5 0 013.5 4.5" />
  </Base>
);

export const PlateIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
  </Base>
);

export const SpinnerIcon = ({ size = 18, className = "", ...p }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`spin ${className}`.trim()}
    aria-hidden
    {...p}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
