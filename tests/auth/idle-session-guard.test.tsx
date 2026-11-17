import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/overview"),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}));

vi.mock("@/lib/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: vi.fn(() => null),
}));

import {
  createIdleSessionController,
  IDLE_WARNING_COPY,
  SIGN_OUT_LABEL,
  STAY_SIGNED_IN_LABEL,
  type IdleSessionMessage,
  type IdleSessionSnapshot,
} from "@/components/auth/idle-session-guard";

const NOW = new Date("2026-05-10T12:00:00.000Z").getTime();
const IDLE_MS = 30 * 60 * 1000;
const MINUTE = 60 * 1000;

interface HarnessOptions {
  onPing?: () => void;
  onTimeout?: () => void;
  onSignOut?: () => void;
  announce?: (message: IdleSessionMessage) => void;
  subscribe?: (handler: (message: IdleSessionMessage) => void) => () => void;
}

function harness(options: HarnessOptions = {}) {
  const states: IdleSessionSnapshot[] = [];
  const pings = vi.fn(options.onPing);
  const timeout = vi.fn(options.onTimeout);
  const signOut = vi.fn(options.onSignOut);
  const announce = vi.fn(options.announce);
  const subscribe = vi.fn(
    options.subscribe ?? (() => () => undefined),
  );

  const controller = createIdleSessionController({
    idleMs: IDLE_MS,
    onPing: pings,
    onTimeout: timeout,
    onSignOut: signOut,
    onState: (state) => states.push(state),
    announce,
    subscribe,
  });

  return {
    controller,
    states,
    pings,
    timeout,
    signOut,
    announce,
    subscribe,
    latest: () => states[states.length - 1],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("IdleSessionGuard", () => {
  it("uses the agreed warning and action copy", () => {
    expect(IDLE_WARNING_COPY).toBe(
      "You'll be signed out in 2 minutes for your security",
    );
    expect(STAY_SIGNED_IN_LABEL).toBe("Stay signed in");
    expect(SIGN_OUT_LABEL).toBe("Sign out");
  });

  it("shows the warning at 28 minutes with a live two-minute countdown", () => {
    const h = harness();
    h.controller.start();

    vi.advanceTimersByTime(27 * MINUTE);
    expect(h.latest().warningOpen).toBe(false);

    vi.advanceTimersByTime(MINUTE);
    expect(h.latest().warningOpen).toBe(true);
    expect(h.latest().remainingMs).toBe(2 * MINUTE);
    expect(h.timeout).not.toHaveBeenCalled();
  });

  it("Stay signed in pings even when throttled, then resets the warning", () => {
    const h = harness();
    h.controller.start();
    expect(h.pings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(MINUTE);
    h.controller.activity();
    expect(h.pings).toHaveBeenCalledTimes(1);

    h.controller.staySignedIn();
    expect(h.pings).toHaveBeenCalledTimes(2);
    expect(h.latest().warningOpen).toBe(false);
    expect(h.latest().remainingMs).toBe(IDLE_MS);
    expect(h.announce).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "activity" }),
    );
  });

  it("redirects with the session-expired reason when the countdown reaches zero", () => {
    const h = harness();
    h.controller.start();

    vi.advanceTimersByTime(28 * MINUTE);
    expect(h.latest().warningOpen).toBe(true);

    vi.advanceTimersByTime(2 * MINUTE);

    expect(h.timeout).toHaveBeenCalledTimes(1);
    expect(h.latest().remainingMs).toBe(0);
    expect(h.latest().warningOpen).toBe(true);
  });

  it("pings at most once every five minutes while active", () => {
    const h = harness();
    h.controller.start();
    expect(h.pings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * MINUTE);
    h.controller.activity();
    expect(h.pings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3 * MINUTE);
    h.controller.activity();
    expect(h.pings).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5 * MINUTE);
    h.controller.activity();
    expect(h.pings).toHaveBeenCalledTimes(3);
  });

  it("resets another tab's warning without pinging that tab", () => {
    let receiveA: ((message: IdleSessionMessage) => void) | undefined;
    let receiveB: ((message: IdleSessionMessage) => void) | undefined;

    const a = harness({
      announce: (message) => receiveB?.(message),
      subscribe: (handler) => {
        receiveA = handler;
        return () => {
          receiveA = undefined;
        };
      },
    });
    const b = harness({
      announce: (message) => receiveA?.(message),
      subscribe: (handler) => {
        receiveB = handler;
        return () => {
          receiveB = undefined;
        };
      },
    });

    a.controller.start();
    b.controller.start();
    vi.advanceTimersByTime(28 * MINUTE);

    expect(a.latest().warningOpen).toBe(true);
    expect(b.latest().warningOpen).toBe(true);
    const pingsBefore = a.pings.mock.calls.length;

    b.controller.activity();

    expect(a.latest().warningOpen).toBe(false);
    expect(a.latest().remainingMs).toBe(IDLE_MS);
    expect(a.pings).toHaveBeenCalledTimes(pingsBefore);
  });

  it("signs out every tab through the shared channel", () => {
    let receiveB: ((message: IdleSessionMessage) => void) | undefined;
    const a = harness({ announce: (message) => receiveB?.(message) });
    const b = harness({ subscribe: (handler) => {
      receiveB = handler;
      return () => {
        receiveB = undefined;
      };
    } });

    a.controller.start();
    b.controller.start();

    a.controller.signOut();

    expect(a.signOut).toHaveBeenCalledTimes(1);
    expect(b.signOut).toHaveBeenCalledTimes(1);
    expect(a.latest().warningOpen).toBe(false);
  });
});
