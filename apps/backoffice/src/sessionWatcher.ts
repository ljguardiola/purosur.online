import { useEffect, useRef } from "react";
import type { SessionStatusOutcome } from "./sessionApi";

/** How often the watcher re-checks regardless of any known deadline: revocation and deactivation carry no deadline of their own. */
const DEFAULT_INTERVAL_MS = 60_000;

/** Extra time added past a reported deadline before checking it, to absorb clock drift between the browser and the cloud. */
const DEFAULT_DEADLINE_MARGIN_MS = 5_000;

export type SessionWatcherOptions = {
  active: boolean;
  initialExpiresAt?: string;
  /** Looks the session up without extending it (`checkSessionStatus`). */
  checkStatus: () => Promise<SessionStatusOutcome>;
  onEnded: () => void;
  intervalMs?: number;
  deadlineMarginMs?: number;
  now?: () => Date;
};

/** Fails open: network trouble or a rate limit leaves the tab signed in, and the next scheduled check retries. */
export function useSessionWatcher({
  active,
  initialExpiresAt,
  checkStatus,
  onEnded,
  intervalMs = DEFAULT_INTERVAL_MS,
  deadlineMarginMs = DEFAULT_DEADLINE_MARGIN_MS,
  now = () => new Date(),
}: SessionWatcherOptions): void {
  // Refs, not effect dependencies: a re-render from an unrelated route change must not tear down
  // and restart the running timers.
  const checkStatusRef = useRef(checkStatus);
  checkStatusRef.current = checkStatus;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const nowRef = useRef(now);
  nowRef.current = now;

  // Lets an activity touch move the deadline out by calling into the running effect's own
  // scheduling function, instead of tearing down and recreating the interval timer on every touch.
  const scheduleDeadlineRef = useRef<((expiresAt: string) => void) | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let checking = false;

    // Explicitly `number`, not `ReturnType<typeof window.setTimeout>`: with @types/node's globals
    // in scope, that type resolves to Node's `Timeout`, not the plain number `window.setTimeout` returns.
    let deadlineTimeoutId: number | undefined;

    function scheduleDeadline(expiresAt: string) {
      if (deadlineTimeoutId !== undefined) {
        window.clearTimeout(deadlineTimeoutId);
        deadlineTimeoutId = undefined;
      }
      const delay = new Date(expiresAt).getTime() - nowRef.current().getTime() + deadlineMarginMs;
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
        const outcome = await checkStatusRef.current();
        if (cancelled) {
          return;
        }
        if (outcome.kind === "unauthenticated") {
          onEndedRef.current();
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
  }, [active, intervalMs, deadlineMarginMs]);

  // Separate from the interval-owning effect above, so a later `initialExpiresAt` reschedules the
  // deadline without tearing down and restarting the interval and its listeners.
  useEffect(() => {
    if (active && initialExpiresAt !== undefined) {
      scheduleDeadlineRef.current?.(initialExpiresAt);
    }
  }, [active, initialExpiresAt]);
}
