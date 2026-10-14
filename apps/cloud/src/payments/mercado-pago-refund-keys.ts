import { randomUUID } from "node:crypto";
import type { MercadoPagoRefundKeys } from "@purosur/domain/payments/use-cases";

export const randomMercadoPagoRefundKeys: MercadoPagoRefundKeys = {
  newRefundKey: randomUUID,
};
