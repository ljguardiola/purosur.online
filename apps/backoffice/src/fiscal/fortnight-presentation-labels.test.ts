import { expect, test } from "vitest";
import { presentationStateBadge } from "./fortnight-presentation-labels";

test.each([
  [null, { label: "Pendiente", tone: "warning" }],
  ["submitting", { label: "Presentando", tone: "info" }],
  ["refused", { label: "Rechazado", tone: "error" }],
  ["blocked", { label: "Bloqueado", tone: "error" }],
  ["accepted", { label: "Aceptado", tone: "success" }],
] as const)("badges the state %s", (state, badge) => {
  expect(presentationStateBadge(state)).toEqual(badge);
});
