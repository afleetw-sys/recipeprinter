"use client";

import { useEffect, useState, type ComponentType } from "react";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { hasProUpgradeIntent } from "@/lib/proUpgradeIntent";

type Checkout = ComponentType<{ openOnMount: boolean }>;

const loadCheckout = () => import("@/components/seo/PricingProCheckout").then((mod) => mod.default);

/**
 * The /pricing Pro button. The checkout behind it starts Firebase sign-in,
 * App Check and reCAPTCHA, the heaviest scripts this page could run, so a
 * visitor who never presses it never loads them. It's loaded straight away
 * only when it has work to do on arrival: this browser has been signed in
 * (the button may need to say Pro is on), or a plan was chosen before a
 * phone's sign-in redirect and checkout has to resume for it.
 */
export function PricingProButton() {
  const [Checkout, setCheckout] = useState<Checkout | null>(null);
  const [pressed, setPressed] = useState(false);

  function load() {
    loadCheckout()
      .then((component) => setCheckout(() => component))
      .catch(() => setPressed(false));
  }

  useEffect(() => {
    if (readCookPilotWasSignedIn() || hasProUpgradeIntent()) load();
  }, []);

  if (Checkout) return <Checkout openOnMount={pressed} />;

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary w-full"
        aria-busy={pressed || undefined}
        onClick={() => {
          if (pressed) return;
          setPressed(true);
          load();
        }}
      >
        Get RecipePrinter Pro
      </button>
    </div>
  );
}
