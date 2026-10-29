import type { RegisteredFreight } from "../freight-by-period-report.js";

export function aFreight(overrides: Partial<RegisteredFreight> = {}): RegisteredFreight {
  return {
    freightOn: "2026-10-06",
    amountCents: 10_000,
    ...overrides,
  };
}
