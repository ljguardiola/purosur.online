import type { RecordedAiCall } from "../ai-cost-report.js";

export function anAiCall(overrides: Partial<RecordedAiCall> = {}): RecordedAiCall {
  return {
    purpose: "READING",
    occurredOn: "2026-10-06",
    supplierId: "supplier-a",
    supplierName: "Distribuidora Sur",
    personId: "person-1",
    personName: "Ana Pérez",
    costNanoUsd: 1_000,
    ...overrides,
  };
}
