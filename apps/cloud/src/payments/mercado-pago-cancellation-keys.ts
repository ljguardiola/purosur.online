import { randomUUID } from "node:crypto";
import type { MercadoPagoCancellationKeys } from "@purosur/domain/payments/use-cases";

export const randomMercadoPagoCancellationKeys: MercadoPagoCancellationKeys = {
  newCancellationKey: randomUUID,
};
