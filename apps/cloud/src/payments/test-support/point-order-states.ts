import { vi } from "vitest";
import { createMercadoPagoOrdersClient } from "../mercado-pago-orders-client.js";
import {
  POINT_TERMINAL_ID,
  pointAtTerminalOrder,
  pointCanceledByTerminalOrder,
  pointExpiredOrder,
  pointFailedOrder,
  pointPaidWithCardOrder,
} from "./mercado-pago-documented-orders.js";

export const POINT_ORDER_STATES = [
  ["accredited on the terminal", pointPaidWithCardOrder, "APPROVED"],
  ["failed on the terminal", pointFailedOrder, "DECLINED"],
  ["cancelled on the terminal", pointCanceledByTerminalOrder, "CANCELLED"],
  ["expired", pointExpiredOrder, "EXPIRED"],
  ["waiting at the terminal", pointAtTerminalOrder, "PENDING"],
] as const;

export function clientAnsweringOrder(order: Record<string, unknown>) {
  return createMercadoPagoOrdersClient({
    accessToken: "APP_USR-fictional-access-token-0001",
    externalPosId: "STORE01POS01",
    pointTerminalId: POINT_TERMINAL_ID,
    fetch: vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(order), { status: 200 }),
    ),
  });
}
