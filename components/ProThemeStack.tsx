"use client";

import { TemplateThumbnail } from "@/components/print/TemplateThumbnail";
import type { RecipePrintTemplate } from "@/types/recipe";

/**
 * Three Pro theme cards, fanned: what Pro gets you, shown with the themes
 * themselves. Each is the theme picker's own preview (the real card, scaled
 * down, with its sample recipe), so it can never drift from the real theme the
 * way a drawn imitation does. Needs print.css, so it lives on /print only.
 */
const STACK: Array<{ template: RecipePrintTemplate; style: string }> = [
  { template: "keepsake", style: "left-0 top-3 -rotate-6" },
  { template: "garden", style: "right-0 top-3 rotate-6" },
  { template: "heirloom", style: "left-1/2 top-0 -translate-x-1/2 z-10" },
];

export function ProThemeStack({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto h-[138px] w-[360px] max-w-full ${className}`} aria-hidden>
      {STACK.map(({ template, style }) => (
        <div
          key={template}
          className={`absolute w-[180px] overflow-hidden rounded-md border border-line bg-card ${style}`}
        >
          <TemplateThumbnail template={template} />
        </div>
      ))}
    </div>
  );
}
