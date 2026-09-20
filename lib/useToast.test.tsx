// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, useToast } from "@/lib/useToast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useToast", () => {
  it("starts empty and informational", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toastMessage).toBeNull();
    expect(result.current.toastTone).toBe("info");
  });

  it("shows a message and dismisses it after the duration", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("Saved"));
    expect(result.current.toastMessage).toBe("Saved");

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(result.current.toastMessage).toBe("Saved");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toastMessage).toBeNull();
  });

  it("restarts the clock when a different message replaces it", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("First"));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1000));
    act(() => result.current.showToast("Second"));

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(result.current.toastMessage).toBe("Second");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toastMessage).toBeNull();
  });

  it("does NOT restart the clock when the same text is shown again", () => {
    // Pinned as-is: the effect is keyed on the message string, so a repeat of
    // the identical text neither re-renders nor extends the toast.
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("Saved"));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.showToast("Saved"));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 3000));
    expect(result.current.toastMessage).toBeNull();
  });

  it("clears on demand and cancels the pending dismissal", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("Saved"));
    act(() => result.current.clearToast());
    expect(result.current.toastMessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("showToast puts the tone back to informational", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.setToastTone("error"));
    act(() => result.current.showToast("Saved"));
    expect(result.current.toastTone).toBe("info");
  });

  it("setToastMessage alone leaves the tone alone", () => {
    // The page sets a message directly in two places (the save confirmation and
    // the theme picker's clear). Neither resets the tone; that is today's
    // behavior and this pins it.
    const { result } = renderHook(() => useToast());
    act(() => result.current.setToastTone("error"));
    act(() => result.current.setToastMessage("Direct"));
    expect(result.current.toastTone).toBe("error");
  });

  it("leaves no timer behind when the page unmounts with a toast up", () => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => result.current.showToast("Saved"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
