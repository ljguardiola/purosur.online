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

test("a partially received order is informative and reads Recibido en parte", () => {
  expect(purchaseOrderStatusOf("PARTIALLY_RECEIVED")).toEqual({
    tone: "info",
    label: "Recibido en parte",
  });
});

test("a received order is a success and reads Recibido", () => {
  expect(purchaseOrderStatusOf("RECEIVED")).toEqual({ tone: "success", label: "Recibido" });
});
