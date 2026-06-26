import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/Logo";

// Minimal top bar shared across every page — mirrors CookPilot's cp-topbar.
// The logo is a home link so the product always feels like one focused utility,
// not a sprawling marketing site. Navigation lives in the footer.
export function SiteHeader() {
  return (
    <header className="no-print flex items-center gap-cp-3 px-cp-6 min-h-[62px]">
      <Link href="/" className="flex items-center gap-cp-3" aria-label="RecipePrinter home">
        <LogoMark size={30} />
        <Wordmark className="text-[1.2rem]" />
      </Link>
    </header>
  );
}
