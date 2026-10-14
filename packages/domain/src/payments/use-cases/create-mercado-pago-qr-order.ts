import { MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES } from "../model/mercado-pago-order-charge-wait.js";
import { isValidOrderAmount } from "../model/payment-transaction.js";
import {
  type CreateMercadoPagoOrderInput,
  type CreateMercadoPagoOrderOutcome,
  createMercadoPagoOrder,
  type MercadoPagoOrderKind,
} from "./create-mercado-pago-order.js";
import type { MercadoPagoOrderPorts } from "./mercado-pago-order-ports.js";

export type CreateMercadoPagoQrOrderInput = CreateMercadoPagoOrderInput;

export type CreateMercadoPagoQrOrderOutcome = CreateMercadoPagoOrderOutcome<
  { kind: "invalid_amount" },
  never
>;

const QR_ORDER: MercadoPagoOrderKind<{ kind: "invalid_amount" }, never> = {
  identity: { method: "QR", provider: "MERCADOPAGO_QR" },
  lifetimeMinutes: MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
  refuseAmount: (amount) => (isValidOrderAmount(amount) ? null : { kind: "invalid_amount" }),
  create: ({ mercadoPago }, _registerId, request) => mercadoPago.createQrOrder(request),
};

export function createMercadoPagoQrOrder(
  ports: MercadoPagoOrderPorts,
  input: CreateMercadoPagoQrOrderInput,
): Promise<CreateMercadoPagoQrOrderOutcome> {
  return createMercadoPagoOrder(ports, input, QR_ORDER);
}
