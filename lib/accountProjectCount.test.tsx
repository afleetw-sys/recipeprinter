// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The "Projects" badge in the account menu used to be read from Firestore when
// the menu opened, so the number arrived a beat after the menu, nearly every
// time. It is kept on the device now: read at sign-in, re-read when a project
// is created or deleted, and shown straight away when the menu opens.

const account = vi.hoisted(() => ({
  user: { uid: "cook-1", displayName: "Amelia Winger", email: "a@example.com" } as unknown,
  reads: 0,
  /** Each account read waits on this until a test settles it. */
  pending: [] as Array<(count: number) => void>,
}));

vi.mock("@/components/CookPilotAuth", () => ({
  useCookPilotAuth: () => ({ user: account.user, ready: true }),
  CookPilotLoginDialog: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: () => ({}) }));
vi.mock("@/lib/localProjects", () => ({ loadLocalProjects: () => [], listableLocalProjects: () => [] }));
vi.mock("@/lib/printProjects", () => ({
  summarizePrintProject: (project: unknown) => project,
  loadPrintProjectSummaries: () => {
    account.reads += 1;
    return new Promise((resolve) => {
      account.pending.push((count) =>
        resolve(
          Array.from({ length: count }, (_, i) => ({
            id: `p${i}`,
            kind: "cookbook",
            sections: [],
            createdAt: Date.now() + i,
            updatedAt: Date.now() + i,
          })),
        ),
      );
    });
  },
}));

import AccountAvatarButton from "@/components/AccountAvatarButton";
import { projectLibraryChanged } from "@/lib/projectCount";

/** Lets the account read that is waiting answer with `count` projects. */
async function accountAnswers(count: number) {
  await vi.waitFor(() => expect(account.pending.length).toBeGreaterThan(0));
  await act(async () => {
    account.pending.splice(0).forEach((answer) => answer(count));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
  return within(screen.getByRole("link", { name: /Projects/ }));
}

function badge(menu: ReturnType<typeof openMenu>) {
  return menu.queryByText(/^\d+$/)?.textContent ?? null;
}

beforeEach(() => {
  window.localStorage.clear();
  account.reads = 0;
  account.pending = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the account menu's project count", () => {
  it("is read at sign-in, so the menu opens with it already there", async () => {
    render(<AccountAvatarButton />);
    // Nobody has opened the menu, and the count is already on its way.
    await vi.waitFor(() => expect(account.reads).toBe(1));
    await accountAnswers(4);

    expect(badge(openMenu())).toBe("4");
  });

  it("shows a known count the moment the menu opens, on a later page too", async () => {
    const first = render(<AccountAvatarButton />);
    await accountAnswers(4);
    first.unmount();

    // A new page: the menu opens before any account read could answer.
    render(<AccountAvatarButton />);
    const menu = openMenu();
    expect(badge(menu)).toBe("4");
    expect(account.reads).toBe(1);
  });

  it("follows a project being created or deleted, without reopening", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AccountAvatarButton />);
    await accountAnswers(4);
    const menu = openMenu();
    expect(badge(menu)).toBe("4");

    act(() => projectLibraryChanged("cook-1"));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await accountAnswers(5);
    expect(badge(menu)).toBe("5");
  });

  it("re-reads a stale count quietly, showing the known one meanwhile", async () => {
    const first = render(<AccountAvatarButton />);
    await accountAnswers(4);
    first.unmount();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 5 * 60_000);
    render(<AccountAvatarButton />);
    const menu = openMenu();
    expect(badge(menu)).toBe("4");
    await vi.waitFor(() => expect(account.reads).toBe(2));
    await accountAnswers(6);
    expect(badge(menu)).toBe("6");
  });

  it("never shows one account's count to another", async () => {
    const first = render(<AccountAvatarButton />);
    await accountAnswers(4);
    first.unmount();

    account.user = { uid: "cook-2", displayName: "Someone Else", email: "b@example.com" };
    try {
      render(<AccountAvatarButton />);
      expect(badge(openMenu())).toBeNull();
      await accountAnswers(1);
      expect(badge(within(screen.getByRole("link", { name: /Projects/ })))).toBe("1");
    } finally {
      account.user = { uid: "cook-1", displayName: "Amelia Winger", email: "a@example.com" };
    }
  });
});
