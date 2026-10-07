export interface CreationOrderFields {
  eventId: string;
  deviceId: string;
  deviceSeq: number;
  occurredAt: Date;
  receivedAt: Date;
}

interface Placed<T> {
  event: T;
  occurredAt: number;
  receivedAt: number;
}

// An installation's own sequence is never broken: an event takes the latest
// instants its installation reported up to it, so a clock set back cannot put
// it before an earlier event of the same installation.
function placed<T extends CreationOrderFields>(events: readonly T[]): Placed<T>[] {
  const latest = new Map<string, { occurredAt: number; receivedAt: number }>();
  const bySequence = [...events].sort(
    (a, b) => a.deviceId.localeCompare(b.deviceId) || a.deviceSeq - b.deviceSeq,
  );
  return bySequence.map((event) => {
    const before = latest.get(event.deviceId);
    const occurredAt = Math.max(before?.occurredAt ?? -Infinity, event.occurredAt.getTime());
    const receivedAt = Math.max(before?.receivedAt ?? -Infinity, event.receivedAt.getTime());
    latest.set(event.deviceId, { occurredAt, receivedAt });
    return { event, occurredAt, receivedAt };
  });
}

export function inCreationOrder<T extends CreationOrderFields>(events: readonly T[]): T[] {
  return placed(events)
    .sort(
      (a, b) =>
        a.occurredAt - b.occurredAt ||
        a.receivedAt - b.receivedAt ||
        a.event.deviceId.localeCompare(b.event.deviceId) ||
        a.event.deviceSeq - b.event.deviceSeq,
    )
    .map(({ event }) => event);
}
