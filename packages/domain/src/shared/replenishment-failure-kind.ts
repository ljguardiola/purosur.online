export const REPLENISHMENT_FAILURE_KINDS = ["refused", "unreadable_event"] as const;

export type ReplenishmentFailureKind = (typeof REPLENISHMENT_FAILURE_KINDS)[number];
