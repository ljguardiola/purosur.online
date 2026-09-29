import { type RefObject, useEffect, useEffectEvent, useRef } from "react";
import type { SessionStatusOutcome } from "../access/session-api";

/** How often the watcher re-checks regardless of any known deadline: revocation and deactivation carry no deadline of their own. */
const DEFAULT_INTERVAL_MS = 60_000;

/** Extra time added past a reported deadline before checking it, to absorb clock drift between the browser and the cloud. */
const DEFAULT_DEADLINE_MARGIN_MS = 5_000;

function currentDate(): Date {
  return new Date();
}

export type SessionWatcherOptions = {
  active: boolean;
  initialExpiresAt?: string;
  checkStatus: () => Promise<SessionStatusOutcome>;
  onEnded: () => void;
  intervalMs?: number;
  deadlineMarginMs?: number;
  now?: () => Date;
};

type WatchSessionParams = {
  intervalMs: number;
  deadlineMarginMs: number;
  checkStatus: () => Promise<SessionStatusOutcome>;
  onEnded: () => void;
  now: () => Date;
  scheduleDeadlineRef: RefObject<((expiresAt: string) => void) | undefined>;
};

function watchSession({
  intervalMs,
  deadlineMarginMs,
  checkStatus,
  onEnded,
  now,
  scheduleDeadlineRef,
}: WatchSessionParams): () => void {
  let cancelled = false;
  let checking = false;

  // `number`, not `ReturnType<typeof window.setTimeout>`: @types/node's globals make that resolve to Node's `Timeout`.
  let deadlineTimeoutId: number | undefined;

  function scheduleDeadline(expiresAt: string) {
    if (deadlineTimeoutId !== undefined) {
      window.clearTimeout(deadlineTimeoutId);
      deadlineTimeoutId = undefined;
    }
    const delay = new Date(expiresAt).getTime() - now().getTime() + deadlineMarginMs;
    // A deadline already past while the cloud still reports the session open means the
    // browser's clock runs ahead: checking right away would just loop on the same answer.
    if (delay <= 0) {
      return;
    }
    deadlineTimeoutId = window.setTimeout(() => {
      void check();
    }, delay);
  }
  scheduleDeadlineRef.current = scheduleDeadline;

  async function check() {
    // Every tab of a session shares its request budget: a hidden tab stays quiet.
    if (checking || document.visibilityState !== "visible") {
      return;
    }
    checking = true;
    try {
      const outcome = await checkStatus();
      if (cancelled) {
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onEnded();
        return;
      }
      // The deadline can have moved out since it was scheduled: re-arm instead of leaving a
      // stale timeout to fire a useless check.
      if (outcome.kind === "ok") {
        scheduleDeadline(outcome.expiresAt);
      }
    } finally {
      checking = false;
    }
  }

  const intervalId = window.setInterval(() => {
    void check();
  }, intervalMs);

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      void check();
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    cancelled = true;
    scheduleDeadlineRef.current = undefined;
    window.clearInterval(intervalId);
    if (deadlineTimeoutId !== undefined) {
      window.clearTimeout(deadlineTimeoutId);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function useSessionWatcher({
  active,
  initialExpiresAt,
  checkStatus,
  onEnded,
  intervalMs = DEFAULT_INTERVAL_MS,
  deadlineMarginMs = DEFAULT_DEADLINE_MARGIN_MS,
  now = currentDate,
}: SessionWatcherOptions): void {
  const checkSessionStatus = useEffectEvent(checkStatus);
  const endSession = useEffectEvent(onEnded);
  const readNow = useEffectEvent(now);

  // Lets an activity touch move the deadline out by calling into the running effect's own
  // scheduling function, instead of tearing down and recreating the interval timer on every touch.
  const scheduleDeadlineRef = useRef<((expiresAt: string) => void) | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      return;
    }

    return watchSession({
      intervalMs,
      deadlineMarginMs,
      checkStatus: () => checkSessionStatus(),
      onEnded: () => endSession(),
      now: () => readNow(),
      scheduleDeadlineRef,
    });
  }, [active, intervalMs, deadlineMarginMs]);

  useEffect(() => {
    if (active && initialExpiresAt !== undefined) {
      scheduleDeadlineRef.current?.(initialExpiresAt);
    }
  }, [active, initialExpiresAt]);
}
