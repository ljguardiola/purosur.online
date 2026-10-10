import { isQuarantined, releasedForNewSeries } from "../model/quarantine-release.js";
import type { ReleaseQuarantinedEventPorts } from "./quarantine-release-ports.js";

export interface ReleaseQuarantinedEventInput {
  eventId: string;
  locationId: string;
  releasedBy: string;
}

export type ReleaseQuarantinedEventOutcome =
  | { kind: "not_found" }
  | { kind: "not_quarantined" }
  | { kind: "released" };

export function releaseQuarantinedEvent(
  { quarantineRelease, clock }: ReleaseQuarantinedEventPorts,
  { eventId, locationId, releasedBy }: ReleaseQuarantinedEventInput,
): Promise<ReleaseQuarantinedEventOutcome> {
  return quarantineRelease.transaction<ReleaseQuarantinedEventOutcome>(async (tx) => {
    const aggregate = await tx.aggregateOfEventInBranch(eventId, locationId);
    if (aggregate === undefined) {
      return { kind: "not_found" };
    }
    await tx.lockAggregateWaiting(aggregate);
    const held = await tx.lockEvent(eventId);
    if (held === undefined) {
      return { kind: "not_found" };
    }
    if (!isQuarantined(held)) {
      return { kind: "not_quarantined" };
    }
    const released = releasedForNewSeries();
    const releasedAt = clock.now();
    await tx.releaseForNewSeries(eventId, released);
    await tx.recordRelease({
      eventId,
      releasedBy,
      releasedAt,
      previous: {
        quarantinedAt: held.quarantinedAt,
        attempts: held.attempts,
        lastError: held.lastError,
      },
      released,
    });
    await tx.resolveQuarantineAlert(eventId, releasedAt);
    return { kind: "released" };
  });
}
