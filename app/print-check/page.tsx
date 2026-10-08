"use client";

import { useEffect, useRef, useState } from "react";
import { currentBrowserApp, printIsNative } from "@/lib/browserApp";

/**
 * Which way of printing works in this browser.
 *
 * Built for the Google app, whose web view replaces `window.print()` with a
 * hand-off to the app that throws. Each button tries one route to a print
 * sheet and logs what happened, so one visit from a phone says which route to
 * build into the real Print button. Nothing here is linked from the site.
 */

const HANDLER_NAMES = ["print", "printHandler", "PrintMessageHandler", "printScriptHandler"];

type WebKitWindow = Window & {
  webkit?: { messageHandlers?: Record<string, unknown> };
};

function sourceOf(fn: unknown): string {
  try {
    return Function.prototype.toString.call(fn).replace(/\s+/g, " ").slice(0, 240);
  } catch (error) {
    return `unreadable: ${String(error)}`;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export default function PrintCheckPage() {
  const [log, setLog] = useState<string[]>([]);
  const [facts, setFacts] = useState<Array<[string, string]>>([]);
  const [arrived, setArrived] = useState(false);
  const startedAt = useRef(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pdfRef = useRef<File | null>(null);

  function note(line: string) {
    const seconds = ((Date.now() - startedAt.current) / 1000).toFixed(1);
    setLog((current) => [...current, `${seconds}s  ${line}`]);
  }

  useEffect(() => {
    startedAt.current = Date.now();
    const handlers = (window as WebKitWindow).webkit?.messageHandlers;
    const present = handlers ? HANDLER_NAMES.filter((name) => handlers[name] !== undefined) : [];
    setFacts([
      ["App", currentBrowserApp()],
      ["print() is native", String(printIsNative())],
      ["print() source", sourceOf(window.print)],
      ["webkit.messageHandlers", handlers ? `yes; known handlers: ${present.join(", ") || "none"}` : "no"],
      ["navigator.share", typeof navigator.share === "function" ? "yes" : "no"],
      ["User agent", navigator.userAgent],
    ]);
    const params = new URLSearchParams(window.location.search);
    setArrived(params.has("arrived"));

    const before = () => note("beforeprint (a print sheet is starting)");
    const after = () => note("afterprint (the print sheet closed)");
    const rejection = (event: PromiseRejectionEvent) => note(`unhandled rejection: ${describeError(event.reason)}`);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    window.addEventListener("unhandledrejection", rejection);

    // Fetched ahead so the share below happens inside the tap: iOS only opens
    // the share sheet from a tap, and an await would lose it.
    fetch("/print-check-sample.pdf")
      .then((response) => response.blob())
      .then((blob) => {
        pdfRef.current = new File([blob], "print-check.pdf", { type: "application/pdf" });
      })
      .catch((error) => note(`sample PDF did not load: ${describeError(error)}`));

    // Arriving from the "Open in Safari" button: a new tab's first print is
    // allowed without a tap, so try it the way the real hand-off would.
    let autoPrint: number | undefined;
    if (params.has("arrived")) {
      autoPrint = window.setTimeout(() => {
        note("arrived from the app; printing automatically");
        try {
          window.print();
        } catch (error) {
          note(`automatic print threw: ${describeError(error)}`);
        }
      }, 600);
    }
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      window.removeEventListener("unhandledrejection", rejection);
      if (autoPrint) window.clearTimeout(autoPrint);
    };
    // `note` only appends to state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function plainPrint() {
    note("1. calling window.print()");
    try {
      const result: unknown = window.print();
      if (result instanceof Promise) {
        result.then(
          () => note("1. print() promise resolved"),
          (error) => note(`1. print() promise rejected: ${describeError(error)}`),
        );
      }
      note("1. print() returned without throwing");
    } catch (error) {
      note(`1. print() threw: ${describeError(error)}`);
    }
  }

  function framePrint() {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return note("2. no frame");
    const native = /\[native code\]/.test(sourceOf(frameWindow.print));
    note(`2. the frame's print() is ${native ? "native" : "replaced"}: ${sourceOf(frameWindow.print).slice(0, 80)}`);
    frameWindow.addEventListener("beforeprint", () => note("2. frame beforeprint"), { once: true });
    frameWindow.addEventListener("afterprint", () => note("2. frame afterprint"), { once: true });
    try {
      frameWindow.focus();
      frameWindow.print();
      note("2. frame print() returned without throwing");
    } catch (error) {
      note(`2. frame print() threw: ${describeError(error)}`);
    }
  }

  function borrowedPrint() {
    const framePrintFn = frameRef.current?.contentWindow?.print;
    if (!framePrintFn) return note("3. no frame");
    note("3. calling the frame's print() on this page");
    try {
      framePrintFn.call(window);
      note("3. borrowed print() returned without throwing");
    } catch (error) {
      note(`3. borrowed print() threw: ${describeError(error)}`);
    }
  }

  function openInSafari() {
    const target = `x-safari-https://${window.location.host}/print-check?arrived=1`;
    note(`4. opening ${target}`);
    window.location.href = target;
    // If the app ignores the scheme, nothing navigates and this page stays.
    window.setTimeout(() => note("4. still here after 2s (the app may have ignored it)"), 2_000);
  }

  function sharePdf() {
    const file = pdfRef.current;
    if (!file) return note("5. the sample PDF has not loaded yet");
    if (typeof navigator.share !== "function") return note("5. navigator.share is missing");
    const canShare = navigator.canShare?.({ files: [file] }) ?? "unknown";
    note(`5. canShare(files) = ${String(canShare)}; opening the share sheet`);
    navigator.share({ files: [file], title: "Print check" }).then(
      () => note("5. share finished"),
      (error) => note(`5. share failed: ${describeError(error)}`),
    );
  }

  async function copyResults() {
    const text = [...facts.map(([key, value]) => `${key}: ${value}`), "", ...log].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      note("copied");
    } catch (error) {
      note(`copy failed: ${describeError(error)}`);
    }
  }

  return (
    <main className="print-check">
      <style>{`
        .print-check { max-width: 640px; margin: 0 auto; padding: 16px; font: 15px/1.45 system-ui, sans-serif; color: #1d1d1f; background: #fff; }
        .print-check h1 { font-size: 20px; margin: 0 0 4px; }
        .print-check p { margin: 0 0 12px; color: #555; }
        .print-check dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0 0 16px; font-size: 13px; }
        .print-check dt { font-weight: 600; }
        .print-check dd { margin: 0; overflow-wrap: anywhere; }
        .print-check .actions { display: grid; gap: 8px; margin-bottom: 16px; }
        .print-check button { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #c7c7cc; background: #f5f5f7; text-align: left; }
        .print-check pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; background: #f5f5f7; border-radius: 10px; padding: 12px; min-height: 80px; }
        .print-check .card { border: 1px solid #c7c7cc; border-radius: 10px; padding: 16px; margin-top: 16px; }
        .print-check .arrived { background: #e8f5e9; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
        @media print {
          .print-check > :not(.card) { display: none !important; }
          .print-check .card { border: none; }
        }
      `}</style>
      <h1>Print check</h1>
      <p>Tap each button in turn. After each one, note whether a print sheet or share sheet opened, then send a screenshot of this page.</p>
      {arrived ? <div className="arrived">Opened from the app. If a print sheet came up by itself, route 4 works.</div> : null}
      <dl>
        {facts.map(([key, value]) => (
          <div key={key} style={{ display: "contents" }}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="actions">
        <button type="button" onClick={plainPrint}>1. Print normally</button>
        <button type="button" onClick={framePrint}>2. Print through a frame</button>
        <button type="button" onClick={borrowedPrint}>3. Borrow the frame&apos;s print for this page</button>
        <button type="button" onClick={openInSafari}>4. Open in Safari and print there</button>
        <button type="button" onClick={sharePdf}>5. Share a PDF (look for Print in the sheet)</button>
        <button type="button" onClick={() => void copyResults()}>Copy results</button>
      </div>
      <pre>{log.join("\n") || "Nothing yet."}</pre>
      <section className="card">
        <h2>Sample recipe</h2>
        <p>2 cups flour, 3 eggs. Mix, then bake at 350°F for 20 minutes.</p>
      </section>
      <iframe
        ref={frameRef}
        title="Print check frame"
        srcDoc="<!doctype html><title>Frame</title><h2>Sample recipe (from the frame)</h2><p>2 cups flour, 3 eggs. Mix, then bake.</p>"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    </main>
  );
}
