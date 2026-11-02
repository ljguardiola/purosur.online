import { expect, test } from "vitest";
import { purchaseOrderStatusOf } from "./purchase-order-status";

test("a draft is a warning that reads Borrador", () => {
  expect(purchaseOrderStatusOf("DRAFT")).toEqual({ tone: "warning", label: "Borrador" });
});

test("a cancelled order is neutral and reads Cancelado", () => {
  expect(purchaseOrderStatusOf("CANCELLED")).toEqual({ tone: "neutral", label: "Cancelado" });
});

test("a sent order is informative and reads Enviado", () => {
  expect(purchaseOrderStatusOf("SENT")).toEqual({ tone: "info", label: "Enviado" });
});
