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

export type CreateMercadoPagoQrOrderOutcome = CreateMercadoPagoOrderOutcome;

const QR_ORDER: MercadoPagoOrderKind = {
  identity: { method: "QR", provider: "MERCADOPAGO_QR" },
  lifetimeMinutes: MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
  isValidAmount: isValidOrderAmount,
  create: (mercadoPago, request) => mercadoPago.createQrOrder(request),
};

export function createMercadoPagoQrOrder(
  ports: MercadoPagoOrderPorts,
  input: CreateMercadoPagoQrOrderInput,
): Promise<CreateMercadoPagoQrOrderOutcome> {
  return createMercadoPagoOrder(ports, input, QR_ORDER);
}
