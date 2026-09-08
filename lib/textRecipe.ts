import type { Recipe, RecipeIngredient, RecipeInstruction } from "@/types/recipe";

/**
 * A line parser for pasted text, run when CookPilot's parser hands back nothing.
 *
 * Pasted text is the one import where the whole input is already in the
 * browser: nothing was fetched, nothing was transcribed, there is no page that
 * refused us. So "we couldn't pick a recipe out of that" was never the end of
 * what we could do — it was us declining to read three lines that a person
 * reads at a glance:
 *
 *     Banana Bread
 *     2 cups flour
 *     1, Bake it.
 *
 * The remote parser wants an ingredient block it can lock onto (a heading, or a
 * run of measured lines), and a one-ingredient recipe gives it neither. This
 * gives that paste somewhere to land instead of an error telling the cook to go
 * add headings to a recipe they already typed correctly.
 *
 * It is deliberately a fallback and not the first attempt: the remote parser is
 * far better at messy prose, ads, and multi-recipe pastes. This only has to be
 * right about text that is already laid out like a recipe.
 */

// Section headings, in the forms people actually paste them: bare, with a
// colon, in markdown, in caps.
const INGREDIENT_HEADING =
  /^(ingredients?|you'?ll need|what you'?ll need|what you need|shopping list)\b/i;
const INSTRUCTION_HEADING =
  /^(instructions?|directions?|method|steps?|preparation|how to (?:make|cook)|to make|to serve)\b/i;
const NOTE_HEADING = /^(notes?|tips?|tip)\b/i;

const UNIT =
  "cups?|c|tbsps?|tbs|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|" +
  "kilograms?|ml|mls|l|liters?|litres?|quarts?|qt|pints?|pt|gallons?|gal|sticks?|cloves?|" +
  "cans?|jars?|packages?|packets?|pkgs?|boxes?|bunch(?:es)?|sprigs?|slices?|pinch(?:es)?|" +
  "dash(?:es)?|handfuls?|scoops?|cubes?|heads?|stalks?|fillets?|pieces?|drops?";
const UNIT_WORD = new RegExp(`\\b(?:${UNIT})\\b`, "i");

/** Leading list marker: "1.", "2)", "Step 3:", "1," (a comma is a typo away
    from a period, and the cook shouldn't pay for the miss). */
const STEP_MARKER = /^(?:step\s*)?\d{1,3}\s*[.)\]:,–—-]\s+(?=\S)/i;
const BULLET = /^[-*•·‣▪●◦+]\s+/;

/** Starts with a number or a vulgar fraction — the strongest ingredient tell. */
const QUANTITY_START = /^(?:\d|[¼-¾⅐-⅞])/;

/* Verbs that open a step. Nouns that double as verbs (butter, flour, salt,
   pepper, cream, water) are left out on purpose: a bare "Butter" in an
   ingredient list is an ingredient, not an instruction to butter something. */
const COOK_VERB =
  /^(?:pre-?heat|heat|warm|melt|mix|stir|combine|whisk|beat|blend|fold|knead|roll|shape|form|pour|add|place|put|set|transfer|spread|arrange|layer|top|sprinkle|garnish|season|cut|chop|slice|dice|mince|grate|peel|core|trim|drain|rinse|wash|soak|marinate|cover|wrap|chill|refrigerate|freeze|let|leave|rest|cool|bake|roast|grill|broil|fry|saut[eé]|sear|simmer|boil|steam|poach|cook|serve|repeat|divide|scoop|drop|press|line|grease|dust|brush|reduce|remove|turn|flip|toss|mash|puree|process|pulse|store|enjoy|bring|continue|check|test|insert|slide|return|discard|reserve|make|prepare|assemble|whip|sift|dissolve|spoon|fill|seal|shake|strain|skim|thin|thicken|adjust|taste|garnish)\b/i;

const SERVINGS_LINE = /^(?:serves|servings|yield|yields|makes)\b[\s:]*(.+)$/i;
const PREP_LINE = /^prep(?:aration)?\s*time\b[\s:]*(.+)$/i;
const COOK_LINE = /^cook(?:ing)?\s*time\b[\s:]*(.+)$/i;
const TOTAL_LINE = /^total\s*time\b[\s:]*(.+)$/i;

/** Strips the decoration people paste around a heading: "## Ingredients",
    "**INGREDIENTS:**", "--- Method ---". */
function undecorate(line: string): string {
  return line
    .replace(/^[#>\s]+/, "")
    .replace(/^[*_~]+|[*_~]+$/g, "")
    .replace(/^[-=\s]+|[-=:\s]+$/g, "")
    .trim();
}

function wordCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).length;
}

/** A heading is a short label on a line of its own, not a sentence that
    happens to open with the word "steps". */
function headingKind(line: string): "ingredients" | "instructions" | "notes" | null {
  const bare = undecorate(line);
  if (!bare || bare.length > 40 || wordCount(bare) > 5) return null;
  // "Instructions." is a heading; "Method: brown the butter" is not — a heading
  // carries no content of its own beyond the label and a colon.
  const label = bare.replace(/[:.–—-]+$/, "").trim();
  if (wordCount(label) > 4) return null;
  if (INGREDIENT_HEADING.test(label) && wordCount(label) <= 4) return "ingredients";
  if (INSTRUCTION_HEADING.test(label) && wordCount(label) <= 4) return "instructions";
  if (NOTE_HEADING.test(label) && wordCount(label) <= 2) return "notes";
  return null;
}

/** A measured ingredient: "2 cups flour", "1/2 tsp salt", "3 eggs". This is the
    signal we trust; `looseIngredient` below is the guess. */
function measuredIngredient(line: string): boolean {
  if (QUANTITY_START.test(line)) return true;
  return UNIT_WORD.test(line) && /\d/.test(line);
}

/** "Butter, for the pan" — no number, but it reads as a list entry rather than
    a step: short, unpunctuated, and not opening with a cooking verb. */
function looseIngredient(line: string): boolean {
  if (line.length > 60 || wordCount(line) > 8) return false;
  if (/[.!?]$/.test(line)) return false;
  return !COOK_VERB.test(line);
}

function sentence(line: string): boolean {
  if (COOK_VERB.test(line)) return true;
  return /[.!?]["'’”)]?$/.test(line) && wordCount(line) >= 3;
}

interface Draft {
  title?: string;
  description?: string;
  note?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
}

/**
 * Reads a laid-out recipe out of plain text. Returns null when the text
 * carries no recipe signal at all, so a stray paste (a link, a message, a
 * grocery list) still gets the honest "no recipe here" rather than a card
 * built out of whatever was in the clipboard.
 */
export function parseRecipeText(raw: string): Recipe | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const draft: Draft = {};
  const ingredients: RecipeIngredient[] = [];
  const instructionTexts: string[] = [];
  const notes: string[] = [];

  let mode: "front" | "ingredients" | "instructions" | "notes" = "front";
  // Was the current section named by a heading? Inside a declared ingredient
  // list, only a step marker or another heading may end it — an ingredient can
  // read like a sentence ("Chopped tomatoes, drained.") and must not be
  // promoted to a step on that alone.
  let declared = false;
  // Something in the text actually said "recipe": a heading, a numbered step, a
  // measured ingredient. Without one, we hand back nothing.
  let strong = false;

  for (const line of lines) {
    const heading = headingKind(line);
    if (heading) {
      mode = heading;
      declared = true;
      strong = true;
      continue;
    }

    if (captureMeta(line, draft)) continue;

    const stepped = STEP_MARKER.test(line);
    const body = line.replace(STEP_MARKER, "").replace(BULLET, "").trim();
    if (!body) continue;

    // A numbered line whose body is itself measured ("1. 2 cups flour") is a
    // numbered ingredient list, not a step.
    const numberedStep = stepped && !measuredIngredient(body);
    if (numberedStep) {
      mode = "instructions";
      declared = false;
      strong = true;
      instructionTexts.push(body);
      continue;
    }

    if (mode === "front") {
      if (!draft.title && !measuredIngredient(body) && !sentence(body)) {
        draft.title = body;
        continue;
      }
      mode = "ingredients";
      declared = false;
    }

    if (mode === "notes") {
      notes.push(body);
      continue;
    }

    if (mode === "instructions") {
      instructionTexts.push(body);
      continue;
    }

    // mode === "ingredients"
    if (measuredIngredient(body)) {
      strong = true;
      ingredients.push({ raw: body });
      continue;
    }
    if (!declared && sentence(body)) {
      mode = "instructions";
      instructionTexts.push(body);
      continue;
    }
    if (looseIngredient(body) || declared) {
      ingredients.push({ raw: body });
      continue;
    }
    // Unclassifiable and undeclared: a blurb under the title rather than a
    // list entry.
    if (!draft.description) draft.description = body;
  }

  const instructions: RecipeInstruction[] = instructionTexts.map((text, index) => ({
    step: index + 1,
    text,
  }));

  if (!strong) return null;
  if (ingredients.length === 0 && instructions.length === 0) return null;

  return {
    title: draft.title ?? "Untitled recipe",
    description: draft.description,
    note: notes.length > 0 ? notes.join("\n") : undefined,
    servings: draft.servings,
    prepTime: draft.prepTime,
    cookTime: draft.cookTime,
    totalTime: draft.totalTime,
    ingredients,
    instructions,
  };
}

/** Pulls "Serves 8" / "Prep time: 10 min" out of the line flow, where they'd
    otherwise be filed as an ingredient. */
function captureMeta(line: string, draft: Draft): boolean {
  if (wordCount(line) > 6) return false;
  const bare = undecorate(line);
  const servings = SERVINGS_LINE.exec(bare);
  if (servings && !draft.servings) {
    draft.servings = servings[1].trim();
    return true;
  }
  const prep = PREP_LINE.exec(bare);
  if (prep && !draft.prepTime) {
    draft.prepTime = prep[1].trim();
    return true;
  }
  const cook = COOK_LINE.exec(bare);
  if (cook && !draft.cookTime) {
    draft.cookTime = cook[1].trim();
    return true;
  }
  const total = TOTAL_LINE.exec(bare);
  if (total && !draft.totalTime) {
    draft.totalTime = total[1].trim();
    return true;
  }
  return false;
}
