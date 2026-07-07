import Image from "next/image";

const LOGO_SRC = "/images/recipeprinter-logo.png";

export function LogoMark({ size = 30, rounded = 12 }: { size?: number; rounded?: number }) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size, borderRadius: rounded }}
      priority
    />
  );
}

export function LogoImage({
  size = 64,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      priority
    />
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center leading-none font-extrabold ${className}`}
      style={{ letterSpacing: 0 }}
    >
      RecipePrinter
    </span>
  );
}
