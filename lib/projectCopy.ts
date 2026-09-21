import type {
  CookbookFrontMatter,
  CoverConfig,
  CookbookPresetId,
  RecipePrintTemplate,
} from "@/types/recipe";
import type { PhotoStyle, ProjectMeta } from "@/lib/project";

/** What `buildCookbookScaffoldPatch` (app/print/page.tsx) computes for a
    fresh book — a cover and a table of contents. Kept out of that file because
    `scaffoldCookbook` (the legacy in-place toggle) needs the type without
    needing the rest of the page. */
export interface CookbookScaffoldPatch {
  template: RecipePrintTemplate;
  cookbookPreset?: CookbookPresetId;
  photoStyle?: PhotoStyle;
  cover?: CoverConfig;
  backCover?: CoverConfig;
  tableOfContents: boolean;
  sectionDividers: boolean;
  frontMatter?: CookbookFrontMatter;
}
