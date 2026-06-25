"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import RecipeCardPrint from "@/components/RecipeCardPrint";
import { LogoMark, Wordmark } from "@/components/Logo";
import { PrintIcon } from "@/components/icons";
import { readQueue } from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";

export default function PrintPage() {
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const shouldPrint = params.get("print") === "1";
  const [items, setItems] = useState<QueueItem[] | null>(null);

  const ids = useMemo(() => idsParam.split(",").map((s) => s.trim()).filter(Boolean), [idsParam]);

  useEffect(() => {
    const queue = readQueue();
    const byId = new Map(queue.map((it) => [it.id, it]));
    // Preserve the order the user selected them in.
    const selected = ids
      .map((id) => byId.get(id))
      .filter((it): it is QueueItem => Boolean(it && it.status === "ready" && it.recipe));
    setItems(selected);
  }, [ids]);

  // Auto-open the print dialog when the user chose Print instead of Preview.
  useEffect(() => {
    if (shouldPrint && items && items.length > 0) {
      const t = window.setTimeout(() => window.print(), 350);
      return () => window.clearTimeout(t);
    }
  }, [items, shouldPrint]);

  if (items === null) {
    return (
      <div className="min-h-screen grid place-items-center text-ink-soft">Preparing…</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
        <p className="font-bold text-[1.1rem]">Nothing to print</p>
        <p className="text-ink-soft max-w-sm">
          We couldn&apos;t find those recipes — they may have been removed, or this page was
          opened directly.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to your recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toolbar — hidden when printing */}
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-cp-4 px-cp-6 min-h-[62px] bg-page/85 backdrop-blur border-b border-line">
        <Link href="/" className="flex items-center gap-cp-3 group">
          <span className="text-ink-soft group-hover:text-ink transition-colors">←</span>
          <LogoMark size={26} />
          <Wordmark className="text-[1.05rem]" />
        </Link>

        <div className="flex items-center gap-cp-3">
          <span className="text-[0.85rem] text-ink-soft hidden sm:inline">
            {items.length} {items.length === 1 ? "recipe" : "recipes"}
          </span>
          <button onClick={() => window.print()} className="btn btn-primary btn-compact">
            <PrintIcon size={16} />
            Print
          </button>
        </div>
      </header>

      {/* Print preview / printed content */}
      <main className="px-cp-6 py-cp-7 print:p-0">
        {shouldPrint && (
          <p className="no-print text-center text-[0.8rem] text-ink-soft mb-cp-6">
            The print dialog opens automatically. Each recipe prints as its own 6×4″ card.
          </p>
        )}

        <div className="flex flex-col items-center gap-cp-6 print:gap-0 print:items-stretch">
          {items.map((item) => (
            <RecipeCardPrint key={item.id} recipe={item.recipe!} />
          ))}
        </div>
      </main>
    </div>
  );
}
