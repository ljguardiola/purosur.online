import { type CreationOrderFields, inCreationOrder } from "./creation-order.js";

export interface HeldEventState extends CreationOrderFields {
  quarantinedAt: Date | null;
  nextAttemptAt: Date | null;
}

export type NextEventToApply<T extends HeldEventState> =
  | { kind: "none" }
  | { kind: "blocked_by_quarantine"; eventId: string }
  | { kind: "waiting"; until: Date }
  | { kind: "due"; event: T };

export function nextEventToApply<T extends HeldEventState>(
  unapplied: readonly T[],
  now: Date,
): NextEventToApply<T> {
  const [earliest] = inCreationOrder(unapplied);
  if (earliest === undefined) {
    return { kind: "none" };
  }
  if (earliest.quarantinedAt !== null) {
    return { kind: "blocked_by_quarantine", eventId: earliest.eventId };
  }
  if (earliest.nextAttemptAt !== null && earliest.nextAttemptAt.getTime() > now.getTime()) {
    return { kind: "waiting", until: earliest.nextAttemptAt };
  }
  return { kind: "due", event: earliest };
}
