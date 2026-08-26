// Lightweight inline icons (RecipePrinter has no icon dependency). Stroke-based
// to echo the weight of CookPilot's Phosphor icons.
import type { SVGProps } from "react";

// Shared icon-size scale so nearby components land on the same value instead
// of each picking its own close-enough number (this replaced e.g. XIcon
// close buttons at both 16 and 17, and meta icons split between 13 and 14).
// Icons that intentionally stand out on their own — empty-state graphics,
// the upload dropzone glyph — size themselves directly instead of using this.
// Which step a given icon takes is decided by WHAT IT SITS IN, not by the call
// site, or the same button ends up with a 16px glyph on one side and a 14px one
// on the other (the rail's Add carried exactly that pair):
//   - a LEADING icon takes its control's size — `md` inside any .btn, so Save,
//     Print, Add recipes, Add cover and Organize it for me all match;
//   - a TRAILING disclosure chevron takes the TEXT's size (`sm`), because it
//     belongs to the label rather than to the button;
//   - meta icons beside small text are `sm`; glyphs inside a status chip `xs`.
export const ICON_SIZE = {
  xs: 12, // micro badges, inline chip checkmarks
  sm: 14, // meta icons (clock/servings/external-link), trailing chevrons
  md: 16, // leading icons in buttons, close icons, standard controls
  lg: 18, // default size — nav/toolbar icons, matches Base's own default
} as const;

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

export const MinusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
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

export const ArrowRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
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

/** Floppy disk — the conventional "save" glyph, and the only one people read
    as save rather than as download or upload. */
export const SaveIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 3h11l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M8 3v6h7V3" />
    <path d="M8 21v-7h8v7" />
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

export const CrownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 18h14" />
    <path d="M6 15l1-8 4 4 3-6 3 6 4-4 1 8H6z" />
  </Base>
);

export const BookIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13z" />
    <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z" />
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

export const AccountIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0115 0" />
  </Base>
);

export const SizeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </Base>
);

// Sort: three rules of decreasing length. Reads as "put these in an order"
// without committing to a direction the way an arrow glyph would.
export const SortIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 7h14" />
    <path d="M5 12h9" />
    <path d="M5 17h5" />
  </Base>
);

export const GripIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.4" />
    <circle cx="15" cy="6" r="1.4" />
    <circle cx="9" cy="12" r="1.4" />
    <circle cx="15" cy="12" r="1.4" />
    <circle cx="9" cy="18" r="1.4" />
    <circle cx="15" cy="18" r="1.4" />
  </Base>
);

export const TemplateIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M3.5 9.5h17" />
    <path d="M9.7 9.5v11" />
  </Base>
);

export const EditIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
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

/** Google's four-colour G, drawn rather than fetched — the sign-in dialog is
    the only place it appears, and a remote asset there would be a blank square
    on the slowest connections. */
export function GoogleIcon({ size = ICON_SIZE.md }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.73a5.4 5.4 0 0 1 0-3.46V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

/** The Apple mark, in currentColor so it inherits the button's ink. */
export function AppleIcon({ size = ICON_SIZE.md }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden focusable="false">
      <path d="M13.19 9.56c-.02-1.96 1.6-2.9 1.67-2.95-.91-1.33-2.33-1.51-2.83-1.53-1.2-.12-2.35.71-2.96.71-.61 0-1.55-.7-2.55-.68-1.31.02-2.52.76-3.2 1.93-1.36 2.37-.35 5.87 1.98 7.79.71.62 1.55 1.32 2.66 1.28 1.07-.04 1.47-.69 2.76-.69s1.66.69 2.79.67c1.15-.02 1.88-.63 2.58-1.26.81-.73 1.15-1.44 1.17-1.48-.03-.01-2.24-.86-2.27-3.4ZM11.3 3.6c.55-.66.92-1.58.82-2.5-.79.03-1.75.53-2.32 1.19-.51.58-.95 1.52-.83 2.42.88.07 1.78-.45 2.33-1.11Z" />
    </svg>
  );
}

/** Sliders — the print settings that live behind a dialog rather than in the
    panel itself (cut lines, double-sided, source URL). */
export const SlidersIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="14" cy="18" r="2" />
  </Base>
);
