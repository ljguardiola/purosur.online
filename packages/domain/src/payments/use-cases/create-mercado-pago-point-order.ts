import {
  isValidPointOrderAmount,
  MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES,
} from "../model/mercado-pago-point-order.js";
import { isValidOrderAmount } from "../model/payment-transaction.js";
import {
  type CreateMercadoPagoOrderInput,
  type CreateMercadoPagoOrderOutcome,
  createMercadoPagoOrder,
  type MercadoPagoOrderKind,
} from "./create-mercado-pago-order.js";
import type { MercadoPagoOrderPorts } from "./mercado-pago-order-ports.js";

export type CreateMercadoPagoPointOrderInput = CreateMercadoPagoOrderInput;

type PointAmountRefusal = { kind: "invalid_amount" } | { kind: "below_minimum" };

type PointOrderNotCreated = { kind: "not_configured" };

export type CreateMercadoPagoPointOrderOutcome = CreateMercadoPagoOrderOutcome<
  PointAmountRefusal,
  PointOrderNotCreated
>;

const POINT_ORDER: MercadoPagoOrderKind<PointAmountRefusal, PointOrderNotCreated> = {
  identity: { method: "POINT", provider: "MERCADOPAGO_POINT" },
  lifetimeMinutes: MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES,
  refuseAmount: (amount) => {
    if (isValidPointOrderAmount(amount)) {
      return null;
    }
    return isValidOrderAmount(amount) ? { kind: "below_minimum" } : { kind: "invalid_amount" };
  },
  create: async (mercadoPago, request) => {
    const creation = await mercadoPago.createPointOrder(request);
    return creation.kind === "not_configured"
      ? { kind: "not_created", outcome: creation }
      : creation;
  },
};

export function createMercadoPagoPointOrder(
  ports: MercadoPagoOrderPorts,
  input: CreateMercadoPagoPointOrderInput,
): Promise<CreateMercadoPagoPointOrderOutcome> {
  return createMercadoPagoOrder(ports, input, POINT_ORDER);
}
