import { vi } from "vitest";
import type { OutsideRefundsScreenServices } from "../outside-refunds-services";

export function createOutsideRefundsServices(): OutsideRefundsScreenServices {
  return {
    fetchPendingRefunds: vi.fn(),
    markRefundDone: vi.fn(),
    discardRefund: vi.fn(),
  };
}
