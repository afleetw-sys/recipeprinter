"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { AccountIcon, BookIcon, CheckIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { loadPrintProjects } from "@/lib/printProjects";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import type { PrintProject } from "@/types/recipe";
import type { User } from "firebase/auth";

// Two initials from the signed-in identity — first+last of a display name, else
// the first letter of the email — so a logged-in avatar shows who's signed in.
function accountInitials(user: User): string {
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0].slice(0, 2);
    if (letters) return letters.toUpperCase();
  }
  const email = user.email?.trim();
  if (email) return email[0].toUpperCase();
  return "";
}

export type AccountSaveStatus =
  | "saving"
  | "saved"
  | "offline"
  | "error"
  | "conflict"
  | "adoption";

const STATUS_LABEL: Record<AccountSaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — changes pending",
  error: "Couldn’t save",
  conflict: "Newer version found",
  adoption: "Finish saving to your account",
};

export function AccountControl({
  saveStatus,
  onRetry,
}: {
  saveStatus?: AccountSaveStatus | null;
  onRetry?: () => void;
}) {
  const { user, ready } = useCookPilotAuth();
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [projects, setProjects] = useState<PrintProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open || !user || !COOKBOOK_ENABLED) return;
    let cancelled = false;
    setLoadingProjects(true);
    loadPrintProjects(user.uid)
      .then((next) => {
        if (!cancelled) setProjects(next);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-cp-2">
      {saveStatus && (
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-1 text-cp-caption text-ink-soft bg-transparent border-0"
          onClick={
            saveStatus === "error" || saveStatus === "adoption" || saveStatus === "conflict"
              ? onRetry
              : undefined
          }
          aria-live="polite"
        >
          {saveStatus === "saving" ? (
            <SpinnerIcon size={ICON_SIZE.sm} />
          ) : saveStatus === "saved" ? (
            <CheckIcon size={ICON_SIZE.sm} />
          ) : null}
          {STATUS_LABEL[saveStatus]}
        </button>
      )}
      <button
        type="button"
        className={`h-9 w-9 rounded-full inline-flex items-center justify-center transition-colors ${
          user
            ? "border border-transparent bg-[var(--cp-accent)] text-[var(--cp-ink)] text-[0.82rem] font-bold tracking-tight"
            : "border border-line bg-card text-ink-soft hover:text-ink hover:border-ink-soft"
        }`}
        aria-label={user ? "Recipe Printer account" : "Sign in to Recipe Printer"}
        title={user ? "Recipe Printer account" : "Sign in to Recipe Printer"}
        onClick={() => {
          if (!ready) return;
          if (user) setOpen((value) => !value);
          else setShowLogin(true);
        }}
      >
        {user && accountInitials(user) ? (
          <span aria-hidden>{accountInitials(user)}</span>
        ) : (
          <AccountIcon size={ICON_SIZE.lg} />
        )}
      </button>

      {open && user && (
        <div className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-cp-4 shadow-xl">
          <div className="flex items-start justify-between gap-cp-3">
            <div className="min-w-0">
              <strong className="block truncate">
                {user.displayName || "Recipe Printer account"}
              </strong>
              <span className="block truncate text-cp-small text-ink-soft">
                {user.email || "Signed in"}
              </span>
            </div>
            <button className="icon-close-btn" onClick={() => setOpen(false)} aria-label="Close account menu">
              <XIcon size={ICON_SIZE.sm} />
            </button>
          </div>
          {/* Hidden until the cookbook feature launches — gated by the same
              COOKBOOK_ENABLED flag as the print-page toggle so relaunch is a
              one-line flip. (Also lists saved print projects today, so restoring
              it brings back the saved-projects list too.) */}
          {COOKBOOK_ENABLED && (
            <div className="mt-cp-4 border-t border-line pt-cp-3">
              <strong className="flex items-center gap-2 text-cp-small">
                <BookIcon size={ICON_SIZE.md} /> My cookbooks
              </strong>
              {loadingProjects ? (
                <p className="mt-2 text-cp-small text-ink-soft">Loading…</p>
              ) : projects.length ? (
                <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/print?project=${encodeURIComponent(project.id)}`}
                      className="rounded-lg px-2 py-2 hover:bg-page"
                      onClick={() => setOpen(false)}
                    >
                      <span className="block truncate text-cp-small font-semibold">
                        {project.title || "Untitled cookbook"}
                      </span>
                      <span className="text-cp-caption text-ink-soft">
                        {project.kind === "printProject" ? "Print project" : "Cookbook"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-cp-small text-ink-soft">Your saved cookbooks will appear here.</p>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn-ghost btn-compact mt-cp-3 w-full"
            onClick={() => void signOut(getFirebaseAuth()).then(() => setOpen(false))}
          >
            Sign out
          </button>
        </div>
      )}

      {showLogin && !user && (
        <CookPilotLoginDialog onClose={() => setShowLogin(false)} onAuthenticated={() => setShowLogin(false)} />
      )}
    </div>
  );
}
