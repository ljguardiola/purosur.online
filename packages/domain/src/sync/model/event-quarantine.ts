export type EventQuarantineReason =
  | { kind: "unreadable" }
  | { kind: "missing_dependency"; aggregateType: string; aggregateId: string }
  | { kind: "not_recorded" };

export interface EventQuarantine {
  deviceId: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  reason: EventQuarantineReason;
}
