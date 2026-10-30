import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import type { RecipePrintTemplate } from "@/types/recipe";

interface Options {
  template: RecipePrintTemplate;
  setTemplate: Dispatch<SetStateAction<RecipePrintTemplate>>;
  /** The live purchase check. Only "ok" is an answer: "idle" hasn't asked yet
      and "error" couldn't, and neither says the cook isn't Pro. */
  status: CustomerInfoLoadStatus;
  /** The cook can print this theme: it's free, they're Pro, or they bought it. */
  unlocked: boolean;
  cookbookMode: boolean;
}

/**
 * Only Pro remembers a Pro theme. Once the purchase check confirms a cook
 * can't print the theme they opened on (remembered in their print settings or
 * a saved card project), it becomes Document, the free theme. Free themes are
 * remembered as before.
 *
 * Most of these are Classic: it was the free default until 2026-10-29, when it
 * moved to Pro, so every free cook from before had it remembered without ever
 * choosing it, and it opened them on a paywalled theme.
 *
 * Returns the setter for the theme picker: a theme picked on the page is a
 * choice, so the cook can look at it for as long as the page is open.
 */
export function useFreeThemeOnOpen({
  template,
  setTemplate,
  status,
  unlocked,
  cookbookMode,
}: Options): Dispatch<SetStateAction<RecipePrintTemplate>> {
  const pickedRef = useRef<SetStateAction<RecipePrintTemplate> | null>(null);

  useEffect(() => {
    if (unlocked || pickedRef.current === template) return;
    if (status !== "ok" || cookbookMode) return;
    setTemplate("document");
  }, [template, setTemplate, status, unlocked, cookbookMode]);

  return useCallback(
    (value: SetStateAction<RecipePrintTemplate>) => {
      pickedRef.current = value;
      setTemplate(value);
    },
    [setTemplate],
  );
}
