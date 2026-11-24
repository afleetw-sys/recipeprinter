import type { ReactNode } from "react";

/**
 * A price, with the regular one struck through before it while it's on sale
 * (Amelia, 2026-11-24: wherever a price changed for the sale, show the old one
 * crossed out). Screen readers hear "Was $19.99, now $15.99".
 */
export function SalePrice({
  price,
  was,
  wasClassName,
}: {
  price: ReactNode;
  /** The regular price, or nothing when it isn't on sale. */
  was?: ReactNode | null;
  wasClassName?: string;
}) {
  if (!was) return <>{price}</>;
  return (
    <>
      <s className={wasClassName}>
        <span className="sr-only">Was </span>
        {was}
      </s>{" "}
      <span className="sr-only">now </span>
      {price}
    </>
  );
}
