import { useEffect, useRef } from "react";
import { onNavigate } from "./router";
import type { SessionOutcome } from "./sessionApi";

/** Minimum time between touches, measured from the last one: an active person keeps a tab alive without flooding the cloud with a request per keystroke. */
const DEFAULT_THROTTLE_MS = 60_000;

/** DOM events real use of the page dispatches; deliberately excludes pointer/mouse move, since a cursor merely resting over the page is not use. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

export type SessionActivityReporterOptions = {
  /** The reporter runs only while this is true, and tears itself down as soon as it turns false. */
  active: boolean;
  /** Touches the session the same way a signed-in screen's own reads do (`fetchSession`). */
  touchSession: () => Promise<SessionOutcome>;
  /** Called with the deadline a successful touch reports, so the watcher's own deadline can follow it. */
  onTouched: (expiresAt: string) => void;
  /** Called once a touch finds the session no longer open. */
  onEnded: () => void;
  /** Milliseconds a burst of activity is collapsed into at most one touch. */
  throttleMs?: number;
  /** Injected clock so the throttle window is deterministic in tests. */
  now?: () => Date;
};

/**
 * Reports real use of an already-open backoffice tab — pointer, keyboard, wheel/scroll and touch
 * activity, and in-app navigation, while the document is visible — by touching the session
 * (`GET /users/session`) at most once per `throttleMs`. The page load that got the tab this far
 * already touched the session, so the throttle window is counted from mount rather than letting
 * the very first activity touch again right away. Network trouble or a rate limit is ignored; the
 * next activity after the throttle window retries.
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
        if (outcome.kind === "ok" && outcome.expiresAt !== undefined) {
          onTouchedRef.current(outcome.expiresAt);
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
