import { useEffect, useRef } from "react";
import type { SessionStatusOutcome } from "./sessionApi";

/** How often the watcher re-checks regardless of any known deadline: revocation and deactivation carry no deadline of their own. */
const DEFAULT_INTERVAL_MS = 60_000;

/** Extra time added past a reported deadline before checking it, to absorb clock drift between the browser and the cloud. */
const DEFAULT_DEADLINE_MARGIN_MS = 5_000;

export type SessionWatcherOptions = {
  /** The watcher runs only while this is true, and tears itself down as soon as it turns false. */
  active: boolean;
  /** The deadline last reported for the session, used to schedule the first check; omitted when unknown. */
  initialExpiresAt?: string;
  /** Looks the session up without extending it (`checkSessionStatus`). */
  checkStatus: () => Promise<SessionStatusOutcome>;
  /** Called once a check finds the session no longer open. */
  onEnded: () => void;
  /** Milliseconds between checks, run regardless of any known deadline. */
  intervalMs?: number;
  /** Extra margin added past `initialExpiresAt` before the first deadline check fires. */
  deadlineMarginMs?: number;
  /** Injected clock so the first deadline check's delay is deterministic in tests. */
  now?: () => Date;
};

/**
 * Watches an already-open backoffice session for the rest of the tab's life, so it notices the
 * session ending — idle or absolute expiry, revocation, deactivation — without a reload. Checks
 * at the known deadline (plus a margin), every `intervalMs` regardless (revocation and
 * deactivation carry no deadline of their own), and whenever the tab becomes visible again.
 * Network trouble or a rate limit leaves the tab signed in; the next scheduled check retries.
 */
export function useSessionWatcher({
  active,
  initialExpiresAt,
  checkStatus,
  onEnded,
  intervalMs = DEFAULT_INTERVAL_MS,
  deadlineMarginMs = DEFAULT_DEADLINE_MARGIN_MS,
  now = () => new Date(),
}: SessionWatcherOptions): void {
  // Latest callbacks are read through refs, not effect dependencies, so a re-render (e.g. from an
  // unrelated route change) never tears down and restarts the running timers.
  const checkStatusRef = useRef(checkStatus);
  checkStatusRef.current = checkStatus;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const nowRef = useRef(now);
  nowRef.current = now;

  // Lets the effect below move the deadline out as soon as real use (throttled activity touches,
  // #192's T3) extends the session, by calling into the running effect's own scheduling function
  // instead of tearing down and recreating the interval timer and its listeners on every touch.
  const scheduleDeadlineRef = useRef<((expiresAt: string) => void) | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let checking = false;

    // Explicitly `number`, not `ReturnType<typeof window.setTimeout>`: with @types/node's globals
    // also in scope, that type resolves to Node's `Timeout`, even though `window.setTimeout` (this
    // code only ever runs in a browser) actually returns a plain number.
    let deadlineTimeoutId: number | undefined;

    function scheduleDeadline(expiresAt: string) {
      if (deadlineTimeoutId !== undefined) {
        window.clearTimeout(deadlineTimeoutId);
      }
      const delay = new Date(expiresAt).getTime() - nowRef.current().getTime() + deadlineMarginMs;
      deadlineTimeoutId = window.setTimeout(
        () => {
          void check();
        },
        Math.max(delay, 0),
      );
    }
    scheduleDeadlineRef.current = scheduleDeadline;

    async function check() {
      if (checking) {
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
        // Real use (throttled activity touches, #192's T3) or simply still open can move the
        // deadline out: re-arm from it instead of leaving the stale one to fire a useless check.
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

  // Schedules from `initialExpiresAt` on mount and on every later value it takes on (e.g. the
  // watcher's own re-arming on an "ok" status, or a fresher deadline an activity touch elsewhere
  // reports through it) without touching the interval-owning effect above.
  useEffect(() => {
    if (active && initialExpiresAt !== undefined) {
      scheduleDeadlineRef.current?.(initialExpiresAt);
    }
  }, [active, initialExpiresAt]);
}
