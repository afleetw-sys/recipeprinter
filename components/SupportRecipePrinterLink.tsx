import Image from "next/image";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

/**
 * The Buy Me a Coffee pill. It lived at the end of the footer row on every
 * page, where beside a Pricing link it read as a tip jar competing with Pro.
 * It now sits on /about, after the story of why RecipePrinter exists, which
 * is where someone who wants to support the person behind it already is.
 */
export function SupportRecipePrinterLink() {
  return (
    <a
      href={COFFEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ffdd00]/70 bg-white px-cp-3 text-cp-caption font-bold text-ink transition-colors hover:border-[#ffdd00] hover:bg-[#fff9d8]"
    >
      <Image
        src={COFFEE_LOGO_SRC}
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="h-5 w-5 rounded-full"
      />
      Support RecipePrinter
    </a>
  );
}
