import { useEffect, useRef } from "react";
import { onNavigate } from "./router";
import type { SessionOutcome } from "./sessionApi";

// Measured from the last touch, not from idle time.
const DEFAULT_THROTTLE_MS = 60_000;

/** Deliberately excludes pointer/mouse move: a cursor merely resting over the page is not use. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

export type SessionActivityReporterOptions = {
  active: boolean;
  touchSession: () => Promise<SessionOutcome>;
  /** Carries the current Administrator flag and permissions so the tab follows a role change made while it stays open. */
  onTouched: (session: Extract<SessionOutcome, { kind: "ok" }>) => void;
  onEnded: () => void;
  throttleMs?: number;
  /** Injected clock so the throttle window is deterministic in tests. */
  now?: () => Date;
};

/**
 * The throttle window starts at mount, not at the first activity, since the page load that got
 * the tab this far already touched the session. Network trouble or a rate limit is silently
 * ignored; the next activity after the window retries.
 */
export function useSessionActivityReporter({
  active,
  touchSession,
  onTouched,
  onEnded,
  throttleMs = DEFAULT_THROTTLE_MS,
  now = () => new Date(),
}: SessionActivityReporterOptions): void {
  const touchSessionRef = useRef(touchSession);
  touchSessionRef.current = touchSession;
  const onTouchedRef = useRef(onTouched);
  onTouchedRef.current = onTouched;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let sending = false;
    let lastTouchAt = nowRef.current().getTime();

    async function touch() {
      sending = true;
      lastTouchAt = nowRef.current().getTime();
      try {
        const outcome = await touchSessionRef.current();
        if (cancelled) {
          return;
        }
        if (outcome.kind === "unauthenticated") {
          onEndedRef.current();
          return;
        }
        if (outcome.kind === "ok") {
          onTouchedRef.current(outcome);
        }
      } finally {
        sending = false;
      }
    }

    function reportActivity() {
      if (sending || document.visibilityState !== "visible") {
        return;
      }
      if (nowRef.current().getTime() - lastTouchAt < throttleMs) {
        return;
      }
      void touch();
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, reportActivity, { passive: true });
    }
    const stopWatchingNavigation = onNavigate(reportActivity);

    return () => {
      cancelled = true;
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, reportActivity);
      }
      stopWatchingNavigation();
    };
  }, [active, throttleMs]);
}
