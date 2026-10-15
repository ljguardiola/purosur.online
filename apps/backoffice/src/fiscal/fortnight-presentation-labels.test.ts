import { expect, test } from "vitest";
import {
  presentationDocumentsLabel,
  presentationDocumentTypeLabel,
  presentationStateBadge,
} from "./fortnight-presentation-labels";

test.each([
  [null, { label: "Pendiente", tone: "warning" }],
  ["submitting", { label: "Presentando", tone: "info" }],
  ["refused", { label: "Rechazado", tone: "error" }],
  ["blocked", { label: "Bloqueado", tone: "error" }],
  ["missing_document", { label: "Falta un comprobante", tone: "error" }],
  ["accepted", { label: "Aceptado", tone: "success" }],
  ["needs_regularization", { label: "A regularizar", tone: "error" }],
] as const)("badges the state %s", (state, badge) => {
  expect(presentationStateBadge({ state, refusal: null })).toEqual(badge);
});

test("badges a refusal the cloud tells is partial as partly rejected", () => {
  expect(presentationStateBadge({ state: "refused", refusal: "partial" })).toEqual({
    label: "Rechazado en parte",
    tone: "error",
  });
});

test("badges a refusal the cloud tells is whole as rejected", () => {
  expect(presentationStateBadge({ state: "refused", refusal: "whole" })).toEqual({
    label: "Rechazado",
    tone: "error",
  });
});

test("names the document type, and shows a dash for a presentation without one", () => {
  expect(presentationDocumentTypeLabel("factura_c")).toBe("Factura C");
  expect(presentationDocumentTypeLabel(null)).toBe("—");
});

test.each([
  [
    { movement: "none", state: "accepted", documentCount: 0, rejectedDocument: null },
    "Sin movimiento",
  ],
  [{ movement: null, state: null, documentCount: 0, rejectedDocument: null }, "—"],
  [{ movement: null, state: "accepted", documentCount: 0, rejectedDocument: null }, "—"],
  [{ movement: null, state: "blocked", documentCount: 0, rejectedDocument: null }, "—"],
  [
    { movement: "none", state: "needs_regularization", documentCount: 1, rejectedDocument: null },
    "1 llegó después",
  ],
  [
    { movement: "none", state: "needs_regularization", documentCount: 3, rejectedDocument: null },
    "3 llegaron después",
  ],
  [
    { movement: "documents", state: "accepted", documentCount: 1, rejectedDocument: null },
    "1 comprobante",
  ],
  [
    { movement: "documents", state: null, documentCount: 1234, rejectedDocument: null },
    "1.234 comprobantes",
  ],
  [
    {
      movement: "documents",
      state: "refused",
      documentCount: 20,
      rejectedDocument: { number: 5, unprocessed: 12 },
    },
    "1 rechazado · 12 sin procesar",
  ],
  [
    {
      movement: "documents",
      state: "refused",
      documentCount: 20,
      rejectedDocument: { number: 5, unprocessed: 0 },
    },
    "1 rechazado",
  ],
] as const)("describes the documents of %j as %s", (presentation, label) => {
  expect(presentationDocumentsLabel(presentation)).toBe(label);
});
