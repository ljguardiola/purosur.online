import { type RefObject, useEffect } from "react";
import type { SessionOutcome } from "../access/session-api";
import { useLatestRef } from "../platform/use-latest-ref";

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
  touchSessionRef: RefObject<() => Promise<SessionOutcome>>;
  subscribeToNavigationRef: RefObject<(listener: () => void) => () => void>;
  onTouchedRef: RefObject<(session: Extract<SessionOutcome, { kind: "ok" }>) => void>;
  onEndedRef: RefObject<() => void>;
  nowRef: RefObject<() => Date>;
};

function reportSessionActivity({
  throttleMs,
  touchSessionRef,
  subscribeToNavigationRef,
  onTouchedRef,
  onEndedRef,
  nowRef,
}: ReportSessionActivityParams): () => void {
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
  const stopWatchingNavigation = subscribeToNavigationRef.current(reportActivity);

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
  const touchSessionRef = useLatestRef(touchSession);
  const subscribeToNavigationRef = useLatestRef(subscribeToNavigation);
  const onTouchedRef = useLatestRef(onTouched);
  const onEndedRef = useLatestRef(onEnded);
  const nowRef = useLatestRef(now);

  useEffect(() => {
    if (!active) {
      return;
    }

    return reportSessionActivity({
      throttleMs,
      touchSessionRef,
      subscribeToNavigationRef,
      onTouchedRef,
      onEndedRef,
      nowRef,
    });
  }, [
    active,
    throttleMs,
    touchSessionRef,
    subscribeToNavigationRef,
    onTouchedRef,
    onEndedRef,
    nowRef,
  ]);
}
