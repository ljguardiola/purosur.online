import { vi } from "vitest";
import type { MercadoPagoRefundsScreenServices } from "../mercado-pago-refunds-services";

export function createMercadoPagoRefundsServices(): MercadoPagoRefundsScreenServices {
  return {
    fetchPendingRefunds: vi.fn(),
    confirmRefund: vi.fn(),
    discardRefund: vi.fn(),
  };
}
