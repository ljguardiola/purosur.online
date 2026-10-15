import type { PendingRefundsBody } from "@purosur/contracts";
import { expect, test } from "vitest";
import { refundReason } from "./refund-reason";

type Refund = PendingRefundsBody["refunds"][number];

const SALE_MOMENT = "2026-09-16T12:37:00.000Z";

const latePayment: Pick<
  Refund,
  | "origin"
  | "sale_occurred_at"
  | "covered_by"
  | "provider_order_id"
  | "cancelled_by"
  | "cancelled_by_name"
> = {
  origin: "late_payment",
  sale_occurred_at: SALE_MOMENT,
  covered_by: ["TRANSFER"],
  provider_order_id: null,
  cancelled_by: null,
  cancelled_by_name: null,
};

const cancelledSale: typeof latePayment = {
  origin: "sale_cancelled",
  sale_occurred_at: SALE_MOMENT,
  covered_by: [],
  provider_order_id: null,
  cancelled_by: "user-1",
  cancelled_by_name: "Lucía Pérez",
};

test("tells a late approval after the sale was charged by transfer", () => {
  expect(refundReason(latePayment)).toEqual({
    title: "Aprobación tardía",
    detail: "El QR de la venta del 16/09 09:37 se pagó después de cobrarla con transferencia",
  });
});

test("tells a QR order paid twice, keeping the origin label", () => {
  expect(refundReason({ ...latePayment, provider_order_id: "ORD01SECOND" })).toEqual({
    title: "Aprobación tardía",
    detail: "El QR de la venta del 16/09 09:37 se pagó dos veces",
  });
});

test.each([
  [["CASH"], "en efectivo"],
  [["TRANSFER"], "con transferencia"],
  [["QR"], "con QR de Mercado Pago"],
  [["POINT"], "con la terminal de Mercado Pago"],
  [["STANDALONE_TERMINAL"], "con la terminal independiente"],
  [["CASH", "TRANSFER"], "en efectivo y con transferencia"],
  [[], "por otro medio"],
] as const)("names how a sale covered by %j was charged: %s", (coveredBy, words) => {
  expect(refundReason({ ...latePayment, covered_by: [...coveredBy] }).detail).toBe(
    `El QR de la venta del 16/09 09:37 se pagó después de cobrarla ${words}`,
  );
});

test("tells a cancelled sale and who cancelled it", () => {
  expect(refundReason(cancelledSale)).toEqual({
    title: "Venta cancelada",
    detail: "La venta del 16/09 09:37 se canceló · la canceló Lucía Pérez",
  });
});

test("tells a cancelled sale alone when its canceller is not a known person", () => {
  expect(refundReason({ ...cancelledSale, cancelled_by_name: null }).detail).toBe(
    "La venta del 16/09 09:37 se canceló",
  );
});

test("tells a cancelled sale alone when nobody is recorded as its canceller", () => {
  expect(refundReason({ ...cancelledSale, cancelled_by: null }).detail).toBe(
    "La venta del 16/09 09:37 se canceló",
  );
});

const voidedSale: typeof latePayment = { ...cancelledSale, origin: "sale_voided" };

test("tells a voided sale and who voided it", () => {
  expect(refundReason(voidedSale)).toEqual({
    title: "Anulación de venta",
    detail: "La venta del 16/09 09:37 se anuló · la anuló Lucía Pérez",
  });
});

test("tells a voided sale alone when nobody known is recorded as its voider", () => {
  expect(refundReason({ ...voidedSale, cancelled_by_name: null }).detail).toBe(
    "La venta del 16/09 09:37 se anuló",
  );
});
