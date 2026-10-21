import { vi } from "vitest";
import { createMercadoPagoOrdersClient } from "../mercado-pago-orders-client.js";

export function clientAnsweringOrder(order: Record<string, unknown>) {
  return createMercadoPagoOrdersClient({
    accessToken: "APP_USR-fictional-access-token-0001",
    fetch: vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(order), { status: 200 }),
    ),
  });
}
