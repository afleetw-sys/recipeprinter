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
export const SignInButton = forwardRef<HTMLButtonElement, { onClick?: () => void }>(
  function SignInButton({ onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="btn btn-secondary btn-compact"
        onClick={onClick}
      >
        Sign in
      </button>
    );
  },
);
