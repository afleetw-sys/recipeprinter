import type {
  CookbookFrontMatter,
  CoverConfig,
  CookbookPresetId,
  RecipePrintTemplate,
} from "@/types/recipe";
import type { PhotoStyle, ProjectMeta } from "@/lib/project";

/** What `buildCookbookScaffoldPatch` (app/print/page.tsx) computes for a
    fresh book — a cover, a table of contents, and chapters when there's
    enough to group. Kept out of that file because `scaffoldCookbook` (the
    legacy in-place toggle) needs the type without needing the rest of the
    page. */
export interface CookbookScaffoldPatch {
  template: RecipePrintTemplate;
  cookbookPreset?: CookbookPresetId;
  photoStyle?: PhotoStyle;
  cover?: CoverConfig;
  backCover?: CoverConfig;
  tableOfContents: boolean;
  sectionDividers: boolean;
  frontMatter?: CookbookFrontMatter;
  /** Auto-organized chapters, only when the scaffold decided there was
      enough to group and nothing was already organized by hand. */
  sections?: ProjectMeta["sections"];
}
