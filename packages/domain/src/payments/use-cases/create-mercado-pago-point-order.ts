import {
  isValidPointOrderAmount,
  MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES,
} from "../model/mercado-pago-point-order.js";
import type { PointCardType } from "../model/payment.js";
import { isValidOrderAmount } from "../model/payment-transaction.js";
import {
  type CreateMercadoPagoOrderInput,
  type CreateMercadoPagoOrderOutcome,
  createMercadoPagoOrder,
  type MercadoPagoOrderKind,
} from "./create-mercado-pago-order.js";
import type { MercadoPagoPointOrderPorts } from "./mercado-pago-order-ports.js";

export type CreateMercadoPagoPointOrderInput = CreateMercadoPagoOrderInput & {
  cardType: PointCardType;
};

type PointAmountRefusal = { kind: "invalid_amount" } | { kind: "below_minimum" };

type PointOrderNotCreated = { kind: "not_configured" };

export type CreateMercadoPagoPointOrderOutcome = CreateMercadoPagoOrderOutcome<
  PointAmountRefusal,
  PointOrderNotCreated
>;

const POINT_ORDER: MercadoPagoOrderKind<
  PointAmountRefusal,
  PointOrderNotCreated,
  MercadoPagoPointOrderPorts,
  CreateMercadoPagoPointOrderInput
> = {
  identityOf: ({ cardType }) => ({ method: "POINT", provider: "MERCADOPAGO_POINT", cardType }),
  lifetimeMinutes: MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES,
  refuseAmount: (amount) => {
    if (isValidPointOrderAmount(amount)) {
      return null;
    }
    return isValidOrderAmount(amount) ? { kind: "below_minimum" } : { kind: "invalid_amount" };
  },
  create: async ({ mercadoPago, pointTerminals }, registerId, request, { cardType }) => {
    const terminalId = await pointTerminals.terminalOfRegister(registerId);
    return terminalId === null
      ? { kind: "not_created", outcome: { kind: "not_configured" } }
      : mercadoPago.createPointOrder({ ...request, terminalId, cardType });
  },
};

export function createMercadoPagoPointOrder(
  ports: MercadoPagoPointOrderPorts,
  input: CreateMercadoPagoPointOrderInput,
): Promise<CreateMercadoPagoPointOrderOutcome> {
  return createMercadoPagoOrder(ports, input, POINT_ORDER);
}
