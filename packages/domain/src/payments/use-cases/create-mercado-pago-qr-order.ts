import { MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES } from "../model/mercado-pago-order-charge-wait.js";
import { isValidOrderAmount } from "../model/payment-transaction.js";
import {
  type CreateMercadoPagoOrderInput,
  type CreateMercadoPagoOrderOutcome,
  createMercadoPagoOrder,
  type MercadoPagoOrderKind,
} from "./create-mercado-pago-order.js";
import type { MercadoPagoQrOrderPorts } from "./mercado-pago-order-ports.js";

export type CreateMercadoPagoQrOrderInput = CreateMercadoPagoOrderInput;

type QrOrderNotCreated = { kind: "not_configured" };

export type CreateMercadoPagoQrOrderOutcome = CreateMercadoPagoOrderOutcome<
  { kind: "invalid_amount" },
  QrOrderNotCreated
>;

const QR_ORDER: MercadoPagoOrderKind<
  { kind: "invalid_amount" },
  QrOrderNotCreated,
  MercadoPagoQrOrderPorts
> = {
  identity: { method: "QR", provider: "MERCADOPAGO_QR" },
  lifetimeMinutes: MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
  refuseAmount: (amount) => (isValidOrderAmount(amount) ? null : { kind: "invalid_amount" }),
  create: async ({ mercadoPago, qrPointsOfSale }, registerId, request) => {
    const externalPosId = await qrPointsOfSale.pointOfSaleOfRegister(registerId);
    return externalPosId === null
      ? { kind: "not_created", outcome: { kind: "not_configured" } }
      : mercadoPago.createQrOrder({ ...request, externalPosId });
  },
};

export function createMercadoPagoQrOrder(
  ports: MercadoPagoQrOrderPorts,
  input: CreateMercadoPagoQrOrderInput,
): Promise<CreateMercadoPagoQrOrderOutcome> {
  return createMercadoPagoOrder(ports, input, QR_ORDER);
}
