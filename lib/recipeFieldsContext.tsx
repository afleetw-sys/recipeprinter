"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fieldsKey, type FieldSwitches } from "@/lib/recipeFields";

/* The current theme's field switches (lib/recipeFields.ts) for every face on a
   page. Apart from that file because it is client-only: the server's card
   export reads the switches' logic too, and a "use client" module hands the
   server references, not functions. */
const RecipeFieldsContext = createContext<FieldSwitches | undefined>(undefined);

/** Around a whole page (the print page, the export), the way ThemeArtProvider
    is, so every face and measurer reads the current theme's switches. */
export function RecipeFieldsProvider({ value, children }: { value: FieldSwitches | undefined; children: ReactNode }) {
  // By value, so a page that reads the switches afresh each render (the
  // export) doesn't redraw every face each time.
  const key = fieldsKey(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => value, [key]);
  return <RecipeFieldsContext.Provider value={stable}>{children}</RecipeFieldsContext.Provider>;
}

export function useFieldSwitches(): FieldSwitches | undefined {
  return useContext(RecipeFieldsContext);
}
