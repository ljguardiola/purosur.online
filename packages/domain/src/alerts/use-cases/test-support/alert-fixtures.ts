import type { FakeAlert } from "./fake-alert-store.js";

export const NOW = new Date("2026-10-01T12:00:00.000Z");

export function seededAlert(overrides: Partial<FakeAlert> = {}): Omit<FakeAlert, "id"> {
  return {
    kind: "backoffice_passkey_changed",
    scope: "user-1",
    level: "warning",
    audience: "all",
    locationId: null,
    detail: {},
    openedAt: new Date("2026-09-30T09:00:00.000Z"),
    escalateAt: new Date("2026-10-01T09:00:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    deduplicates: true,
    ...overrides,
  };
}
