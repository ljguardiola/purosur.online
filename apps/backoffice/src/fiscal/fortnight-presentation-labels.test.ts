import { expect, test } from "vitest";
import {
  fortnightLabel,
  fortnightShortLabel,
  presentationStateBadge,
} from "./fortnight-presentation-labels";

test("labels a fortnight with its first day and its last day written in full", () => {
  expect(fortnightLabel({ start: "2026-08-16", end: "2026-08-31" })).toBe("16 al 31/08/2026");
  expect(fortnightLabel({ start: "2026-09-01", end: "2026-09-15" })).toBe("1 al 15/09/2026");
});

test("labels a fortnight briefly with its first day and its last day and month", () => {
  expect(fortnightShortLabel({ start: "2026-09-01", end: "2026-09-15" })).toBe("1 al 15/09");
  expect(fortnightShortLabel({ start: "2026-08-16", end: "2026-08-31" })).toBe("16 al 31/08");
});

test.each([
  [null, { label: "Pendiente", tone: "warning" }],
  ["ready", { label: "Listo para presentar", tone: "warning" }],
  ["submitting", { label: "Presentando", tone: "info" }],
  ["refused", { label: "Rechazado", tone: "error" }],
  ["blocked", { label: "Bloqueado", tone: "error" }],
  ["accepted", { label: "Aceptado", tone: "success" }],
] as const)("badges the state %s", (state, badge) => {
  expect(presentationStateBadge(state)).toEqual(badge);
});
