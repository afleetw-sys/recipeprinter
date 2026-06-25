export interface RecipeIngredient {
  amount?: string;
  unit?: string;
  name: string;
  note?: string;
  raw?: string;
}

export interface RecipeInstruction {
  step: number;
  text: string;
}

export interface RecipeNutrition {
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  [key: string]: string | undefined;
}

export interface Recipe {
  title: string;
  description?: string;
  image?: string;
  sourceUrl: string;
  sourceName?: string;

  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string | number;
  yield?: string;

  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];

  tags?: string[];
  cuisine?: string;
  course?: string;
  nutrition?: RecipeNutrition;

  author?: string;
  datePublished?: string;
}

export interface ParseResult {
  success: true;
  recipe: Recipe;
}

export interface ParseError {
  success: false;
  error: string;
}

export type ParseResponse = ParseResult | ParseError;
