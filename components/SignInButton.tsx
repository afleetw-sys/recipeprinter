"use client";

import { forwardRef } from "react";

/**
 * The signed-out account control: a button that says what it does.
 *
 * It used to be a circular icon of a person — the same shape the signed-in
 * avatar uses, differing only in whether it held initials or a glyph. That
 * shape is a fine *account* control, because someone with an account knows what
 * their avatar is for. It is a poor *sign-in* control: a visitor who has never
 * signed in has to guess that a person icon means "sign in", and the one thing
 * standing between them and keeping their work read as decoration.
 *
 * Takes its size from the bar it is in, like every other control there:
 * `.btn-compact` in the workspace, where the chrome is 30px, and the full 34px
 * `.btn` on the marketing pages, where it stands beside Start printing. That
 * decision belongs to the surface, not to this button, so it arrives as a prop
 * — the alternative is what shipped first, a control that was workspace-sized
 * everywhere and stood 4px shorter than the CTA next to it.
 *
 * Deliberately `btn-secondary`, matching the other header buttons rather than
 * the primary fill. Signing in is worth finding, but it is never the thing
 * someone came here to do — printing a recipe is — and a solid button up here
 * would argue with the page's own primary action.
 *
 * Kept in its own Firebase-free file so `AccountControl` can render it while
 * the account chunk is still on the wire, and `AccountMenu` can render the very
 * same button once it lands. Two components drawing one control is how you get
 * a flicker at the swap.
 */
export const SignInButton = forwardRef<
  HTMLButtonElement,
  { onClick?: () => void; compact?: boolean }
>(
  function SignInButton({ onClick, compact = false }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`btn btn-secondary${compact ? " btn-compact" : ""}`}
        onClick={onClick}
      >
        Sign in
      </button>
    );
  },
);
