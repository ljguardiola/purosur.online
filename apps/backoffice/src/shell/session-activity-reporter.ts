import { useEffect, useEffectEvent } from "react";
import type { SessionOutcome } from "../sessions/session-api";

const DEFAULT_THROTTLE_MS = 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

function currentDate(): Date {
  return new Date();
}

export type SessionActivityReporterOptions = {
  active: boolean;
  touchSession: () => Promise<SessionOutcome>;
  subscribeToNavigation: (listener: () => void) => () => void;
  onTouched: (session: Extract<SessionOutcome, { kind: "ok" }>) => void;
  onEnded: () => void;
  throttleMs?: number;
  now?: () => Date;
};

type ReportSessionActivityParams = {
  throttleMs: number;
  touchSession: () => Promise<SessionOutcome>;
  subscribeToNavigation: (listener: () => void) => () => void;
  onTouched: (session: Extract<SessionOutcome, { kind: "ok" }>) => void;
  onEnded: () => void;
  now: () => Date;
};

function reportSessionActivity({
  throttleMs,
  touchSession,
  subscribeToNavigation,
  onTouched,
  onEnded,
  now,
}: ReportSessionActivityParams): () => void {
  let cancelled = false;
  let sending = false;
  let lastTouchAt = now().getTime();

  async function touch() {
    sending = true;
    lastTouchAt = now().getTime();
    try {
      const outcome = await touchSession();
      if (cancelled) {
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onEnded();
        return;
      }
      if (outcome.kind === "ok") {
        onTouched(outcome);
      }
    } finally {
      sending = false;
    }
  }

  function reportActivity() {
    if (sending || document.visibilityState !== "visible") {
      return;
    }
    if (now().getTime() - lastTouchAt < throttleMs) {
      return;
    }
    void touch();
  }

  for (const eventName of ACTIVITY_EVENTS) {
    window.addEventListener(eventName, reportActivity, { passive: true });
  }
  const stopWatchingNavigation = subscribeToNavigation(reportActivity);

  return () => {
    cancelled = true;
    for (const eventName of ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, reportActivity);
    }
    stopWatchingNavigation();
  };
}

export function useSessionActivityReporter({
  active,
  touchSession,
  subscribeToNavigation,
  onTouched,
  onEnded,
  throttleMs = DEFAULT_THROTTLE_MS,
  now = currentDate,
}: SessionActivityReporterOptions): void {
  const touchCurrentSession = useEffectEvent(touchSession);
  const subscribeToRouteChanges = useEffectEvent(subscribeToNavigation);
  const handleTouched = useEffectEvent(onTouched);
  const endSession = useEffectEvent(onEnded);
  const readNow = useEffectEvent(now);

  useEffect(() => {
    if (!active) {
      return;
    }

    return reportSessionActivity({
      throttleMs,
      touchSession: () => touchCurrentSession(),
      subscribeToNavigation: (listener) => subscribeToRouteChanges(listener),
      onTouched: (session) => handleTouched(session),
      onEnded: () => endSession(),
      now: () => readNow(),
    });
  }, [active, throttleMs]);
}
