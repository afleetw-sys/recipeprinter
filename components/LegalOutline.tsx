"use client";

import { useEffect, useState } from "react";
import type { LegalSectionSpec } from "@/components/LegalPage";

/**
 * The legal pages' side outline, with the section being read marked.
 *
 * "Being read" is the last section whose heading has crossed a line a third of
 * the way down the screen: the one you are in, not the next one peeking in at
 * the bottom. At the very end of the page the last section wins even if it is
 * too short to reach that line, or it could never be marked at all.
 *
 * Marked with the shared selected tokens (an accent bar and tint), the same
 * treatment as every other single-select control in the app.
 */
export function LegalOutline({ sections }: { sections: LegalSectionSpec[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current: string | null = sections[0]?.id ?? null;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= line) current = section.id;
      }
      if (atBottom) current = sections[sections.length - 1]?.id ?? current;
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  return (
    <ol className="flex flex-col gap-px">
      {sections.map((section, index) => {
        const active = section.id === activeId;
        return (
          <li key={section.id} className="text-cp-small leading-snug">
            <a
              href={`#${section.id}`}
              aria-current={active ? "location" : undefined}
              className={`block rounded-r-md border-l-2 py-1 pl-cp-3 pr-cp-2 font-semibold transition-colors ${
                active
                  ? "border-[var(--cp-selected-border)] bg-[var(--cp-selected-fill)] text-[var(--cp-selected-text)]"
                  : "border-transparent text-brand-ink hover:underline"
              }`}
            >
              <span className="text-ink-soft font-normal tabular-nums">{index + 1}. </span>
              {section.title}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
