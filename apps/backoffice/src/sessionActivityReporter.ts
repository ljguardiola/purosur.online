import { useEffect } from "react";
import { onNavigate } from "./router";
import type { SessionOutcome } from "./sessionApi";
import { useLatestRef } from "./useLatestRef";

const DEFAULT_THROTTLE_MS = 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

export type SessionActivityReporterOptions = {
  active: boolean;
  touchSession: () => Promise<SessionOutcome>;
  onTouched: (session: Extract<SessionOutcome, { kind: "ok" }>) => void;
  onEnded: () => void;
  throttleMs?: number;
  now?: () => Date;
};

export function useSessionActivityReporter({
  active,
  touchSession,
  onTouched,
  onEnded,
  throttleMs = DEFAULT_THROTTLE_MS,
  now = () => new Date(),
}: SessionActivityReporterOptions): void {
  const touchSessionRef = useLatestRef(touchSession);
  const onTouchedRef = useLatestRef(onTouched);
  const onEndedRef = useLatestRef(onEnded);
  const nowRef = useLatestRef(now);

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
  }, [active, throttleMs, touchSessionRef, onTouchedRef, onEndedRef, nowRef]);
}
