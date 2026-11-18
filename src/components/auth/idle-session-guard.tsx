"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { isProtectedPath } from "@/lib/auth/routes";
import {
  IDLE_WARNING_LEAD_MS,
  SESSION_PING_INTERVAL_MS,
  SESSION_PING_PATH,
} from "@/lib/auth/session-ping";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface IdleSessionSnapshot {
  remainingMs: number;
  warningOpen: boolean;
}

export type IdleSessionMessage =
  | { type: "activity"; at: number; id: number }
  | { type: "signout"; id: number };

export interface IdleSessionControllerOptions {
  idleMs: number;
  warningLeadMs?: number;
  pingIntervalMs?: number;
  now?: () => number;
  onPing?: () => void | Promise<void>;
  onTimeout?: () => void;
  onSignOut?: () => void;
  onState?: (snapshot: IdleSessionSnapshot) => void;
  announce?: (message: IdleSessionMessage) => void;
  subscribe?: (handler: (message: IdleSessionMessage) => void) => () => void;
}

export interface IdleSessionController {
  start(): void;
  stop(): void;
  activity(): void;
  staySignedIn(): void;
  signOut(): void;
  getSnapshot(): IdleSessionSnapshot;
}

/**
 * Framework-free engine behind <IdleSessionGuard />. Keeping the timers and
 * cross-tab protocol here makes the behaviour testable with fake timers in a
 * plain Node environment; the component only wires browser events to it.
 */
export function createIdleSessionController(
  options: IdleSessionControllerOptions,
): IdleSessionController {
  const {
    idleMs,
    warningLeadMs = IDLE_WARNING_LEAD_MS,
    pingIntervalMs = SESSION_PING_INTERVAL_MS,
    now = () => Date.now(),
    onPing,
    onTimeout,
    onSignOut,
    onState,
    announce,
    subscribe,
  } = options;

  let running = false;
  let lastActivityAt = now();
  let lastPingAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | undefined;
  let nextMessageId = 0;
  let snapshot: IdleSessionSnapshot = {
    remainingMs: idleMs,
    warningOpen: false,
  };

  function publish(): void {
    onState?.({ ...snapshot });
  }

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    clearTimer();
    if (!running) return;

    const remaining = idleMs - (now() - lastActivityAt);
    if (remaining <= 0) {
      timer = setTimeout(handleTimeout, 0);
      return;
    }

    // One long wait until the warning boundary, then one-second ticks for the
    // live countdown. Activity reschedules from the new timestamp.
    const delay = remaining > warningLeadMs ? remaining - warningLeadMs : 1000;
    timer = setTimeout(tick, Math.max(0, Math.min(delay, remaining)));
  }

  function tick(): void {
    if (!running) return;
    const remaining = Math.max(0, idleMs - (now() - lastActivityAt));
    const warningOpen = remaining <= warningLeadMs;

    if (remaining !== snapshot.remainingMs || warningOpen !== snapshot.warningOpen) {
      snapshot = { remainingMs: remaining, warningOpen };
      publish();
    }

    if (remaining <= 0) {
      handleTimeout();
      return;
    }
    schedule();
  }

  function handleTimeout(): void {
    if (!running) return;
    snapshot = { remainingMs: 0, warningOpen: true };
    publish();
    stop();
    onTimeout?.();
  }

  function maybePing(force: boolean): void {
    const at = now();
    if (!force && lastPingAt !== null && at - lastPingAt < pingIntervalMs) return;
    lastPingAt = at;
    try {
      void Promise.resolve(onPing?.()).catch(() => undefined);
    } catch {
      // A failed activity ping must never take down the UI; the server still
      // enforces the limit on the next real request.
    }
  }

  function applyActivity(
    at: number,
    broadcast: boolean,
    allowPing: boolean,
    forcePing: boolean,
  ): void {
    lastActivityAt = at;
    snapshot = { remainingMs: idleMs, warningOpen: false };
    publish();
    if (broadcast) {
      announce?.({ type: "activity", at, id: nextMessageId++ });
    }
    // A remote tab's activity already produced a ping from the active tab.
    if (allowPing) maybePing(forcePing);
    schedule();
  }

  function activity(): void {
    if (!running) return;
    applyActivity(now(), true, true, false);
  }

  function staySignedIn(): void {
    if (!running) return;
    applyActivity(now(), true, true, true);
  }

  function handleMessage(message: IdleSessionMessage): void {
    if (!running) return;
    if (message.type === "activity") {
      // Use the originating tab's timestamp, not this tab's clock after a
      // delayed delivery. No ping here: the active tab already sent one.
      applyActivity(message.at, false, false, false);
    } else {
      stop();
      onSignOut?.();
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    unsubscribe = subscribe?.(handleMessage);
    activity();
  }

  function stop(): void {
    if (!running) return;
    running = false;
    clearTimer();
    unsubscribe?.();
    unsubscribe = undefined;
  }

  return {
    start,
    stop,
    activity,
    staySignedIn,
    signOut() {
      if (!running) return;
      announce?.({ type: "signout", id: nextMessageId++ });
      stop();
      onSignOut?.();
    },
    getSnapshot: () => ({ ...snapshot }),
  };
}

const CROSS_TAB_NAME = "ledgerai-session-activity";
const CROSS_TAB_STORAGE_KEY = "ledgerai:session-activity";

interface CrossTabChannel {
  announce(message: IdleSessionMessage): void;
  close(): void;
}

function createCrossTabChannel(
  onMessage: (message: IdleSessionMessage) => void,
): CrossTabChannel {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CROSS_TAB_NAME);
    channel.onmessage = (event: MessageEvent<IdleSessionMessage>) =>
      onMessage(event.data);
    return {
      announce: (message) => channel.postMessage(message),
      close: () => channel.close(),
    };
  }

  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CROSS_TAB_STORAGE_KEY || !event.newValue) return;
      try {
        onMessage(JSON.parse(event.newValue) as IdleSessionMessage);
      } catch {
        // Ignore malformed/poisoned storage values from other scripts.
      }
    };
    window.addEventListener("storage", onStorage);
    return {
      announce(message) {
        try {
          // The nonce guarantees a fresh value so repeat activity still fires
          // a storage event in the other tabs.
          window.localStorage.setItem(
            CROSS_TAB_STORAGE_KEY,
            JSON.stringify({ ...message, nonce: `${Date.now()}-${Math.random()}` }),
          );
        } catch {
          // Private browsing / blocked storage must not break the guard.
        }
      },
      close: () => window.removeEventListener("storage", onStorage),
    };
  }

  return { announce: () => undefined, close: () => undefined };
}

export const IDLE_WARNING_COPY =
  "You'll be signed out in 2 minutes for your security";
export const STAY_SIGNED_IN_LABEL = "Stay signed in";
export const SIGN_OUT_LABEL = "Sign out";

export interface IdleSessionGuardProps {
  /** Server-resolved idle limit in milliseconds. Never a NEXT_PUBLIC value. */
  idleMs: number;
}

/** Mounted once by the app layout; inert on public routes. */
export function IdleSessionGuard({ idleMs }: IdleSessionGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const controllerRef = React.useRef<IdleSessionController | null>(null);
  const [snapshot, setSnapshot] = React.useState<IdleSessionSnapshot>({
    remainingMs: idleMs,
    warningOpen: false,
  });

  const enabled = isProtectedPath(pathname ?? "");

  const handlePing = React.useCallback(async () => {
    await fetch(SESSION_PING_PATH, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    });
  }, []);

  const handleTimeout = React.useCallback(() => {
    router.replace("/login?reason=session_expired&expiry=idle");
  }, [router]);

  const handleSignOut = React.useCallback(() => {
    void signOutAction();
  }, []);

  // Stable identities matter: the countdown re-renders every second, and the
  // modal's focus-trap effect keys off onClose.
  const handleStaySignedIn = React.useCallback(() => {
    controllerRef.current?.staySignedIn();
  }, []);
  const handleSignOutClick = React.useCallback(() => {
    controllerRef.current?.signOut();
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    // The controller registers its handler through subscribe() during start().
    // Route incoming cross-tab messages to that handler through a stable ref.
    let receive: ((message: IdleSessionMessage) => void) | undefined;
    const wiredChannel = createCrossTabChannel((message) => receive?.(message));

    const controller = createIdleSessionController({
      idleMs,
      onPing: handlePing,
      onTimeout: handleTimeout,
      onSignOut: handleSignOut,
      onState: setSnapshot,
      announce: wiredChannel.announce,
      subscribe(handler) {
        receive = handler;
        return () => {
          receive = undefined;
        };
      },
    });

    controllerRef.current = controller;
    controller.start();

    const onActivity = () => controller.activity();
    const onVisibility = () => {
      if (document.visibilityState === "visible") controller.activity();
    };

    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.stop();
      wiredChannel.close();
      controllerRef.current = null;
    };
  }, [enabled, handlePing, handleSignOut, handleTimeout, idleMs]);

  if (!enabled) return null;

  const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));

  return (
    <ConfirmDialog
      open={snapshot.warningOpen}
      onClose={handleStaySignedIn}
      onConfirm={handleSignOutClick}
      title="Still there?"
      role="alertdialog"
      description={IDLE_WARNING_COPY}
      confirmLabel={STAY_SIGNED_IN_LABEL}
      cancelLabel={SIGN_OUT_LABEL}
      confirmVariant="primary"
      cancelVariant="dangerOutline"
      notice={
        <p className="text-sm text-foreground" aria-live="assertive">
          Signing out in{" "}
          <span className="font-semibold tabular-nums">{seconds}</span> seconds.
        </p>
      }
    />
  );
}
