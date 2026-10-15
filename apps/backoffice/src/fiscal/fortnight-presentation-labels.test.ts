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
  ["accepted", { label: "Aceptado", tone: "success" }],
  ["needs_regularization", { label: "A regularizar", tone: "error" }],
] as const)("badges the state %s", (state, badge) => {
  expect(presentationStateBadge({ state, rejectedDocument: null })).toEqual(badge);
});

test("badges a refusal that rejected a document as partly rejected", () => {
  expect(
    presentationStateBadge({ state: "refused", rejectedDocument: { number: 7, unprocessed: 2 } }),
  ).toEqual({ label: "Rechazado en parte", tone: "error" });
});

test("names the document type, and shows a dash for a presentation without one", () => {
  expect(presentationDocumentTypeLabel("factura_c")).toBe("Factura C");
  expect(presentationDocumentTypeLabel(null)).toBe("—");
});

test.each([
  [
    { documentType: null, state: "accepted", documentCount: 0, rejectedDocument: null },
    "Sin movimiento",
  ],
  [{ documentType: null, state: null, documentCount: 0, rejectedDocument: null }, "—"],
  [{ documentType: null, state: "blocked", documentCount: 0, rejectedDocument: null }, "—"],
  [
    { documentType: null, state: "needs_regularization", documentCount: 1, rejectedDocument: null },
    "1 llegó después",
  ],
  [
    { documentType: null, state: "needs_regularization", documentCount: 3, rejectedDocument: null },
    "3 llegaron después",
  ],
  [
    { documentType: "factura_c", state: "accepted", documentCount: 1, rejectedDocument: null },
    "1 comprobante",
  ],
  [
    { documentType: "factura_c", state: null, documentCount: 1234, rejectedDocument: null },
    "1.234 comprobantes",
  ],
  [
    {
      documentType: "factura_c",
      state: "refused",
      documentCount: 20,
      rejectedDocument: { number: 5, unprocessed: 12 },
    },
    "1 rechazado · 12 sin procesar",
  ],
  [
    {
      documentType: "factura_c",
      state: "refused",
      documentCount: 20,
      rejectedDocument: { number: 5, unprocessed: 0 },
    },
    "1 rechazado",
  ],
] as const)("describes the documents of %j as %s", (presentation, label) => {
  expect(presentationDocumentsLabel(presentation)).toBe(label);
});
