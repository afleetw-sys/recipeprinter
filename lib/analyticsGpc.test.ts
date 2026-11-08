// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * The privacy policy promises we honor Global Privacy Control. PostHog used to
 * boot for a browser sending it anyway, so analytics and session replay still
 * ran for people who had said no.
 */
const posthogInit = vi.fn();
vi.mock("posthog-js", () => ({
  default: {
    init: posthogInit,
    register_for_session: vi.fn(),
    unregister_for_session: vi.fn(),
    unregister: vi.fn(),
    register_once: vi.fn(),
    register: vi.fn(),
    get_property: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    capture: vi.fn(),
  },
}));
vi.mock("@/lib/appEnvironment", () => ({ isProductionRuntime: () => true }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  posthogInit.mockClear();
  delete (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl;
});

async function bootWith(gpc: boolean | undefined): Promise<boolean> {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  if (gpc !== undefined) {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: gpc, configurable: true });
  }
  vi.useFakeTimers();
  const { initAnalytics } = await import("./analytics");
  initAnalytics();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  // The posthog bundle is a dynamic import; let it settle.
  await new Promise((resolve) => setTimeout(resolve, 50));
  return posthogInit.mock.calls.length > 0;
}

describe("Global Privacy Control", () => {
  test("PostHog never boots for a browser sending GPC, and boots for one that isn't", async () => {
    expect(await bootWith(undefined)).toBe(true);
    vi.resetModules();
    posthogInit.mockClear();
    expect(await bootWith(false)).toBe(true);
    vi.resetModules();
    posthogInit.mockClear();
    expect(await bootWith(true)).toBe(false);
  });
});
