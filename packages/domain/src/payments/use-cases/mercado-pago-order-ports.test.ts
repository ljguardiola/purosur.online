import { describe, expectTypeOf, it } from "vitest";
import type {
  MercadoPagoOrderCancellation,
  MercadoPagoOrders,
} from "./mercado-pago-order-ports.js";

describe("MercadoPagoOrders", () => {
  it("cancels an order only with a key of the cancellation's own", () => {
    expectTypeOf<[orderId: string]>().not.toExtend<Parameters<MercadoPagoOrders["cancelOrder"]>>();
  });
});

describe("MercadoPagoOrderCancellation", () => {
  it("answers an order already cancelled as one that cannot be cancelled, never as an outcome of its own", () => {
    expectTypeOf<{ kind: "already_cancelled" }>().not.toExtend<MercadoPagoOrderCancellation>();
  });
});
