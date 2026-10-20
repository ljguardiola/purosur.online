import { vi } from "vitest";
import type { RefundsScreenServices } from "../refunds-services";

export function createRefundsServices(): RefundsScreenServices {
  return {
    fetchPendingRefunds: vi.fn(),
    markRefundDone: vi.fn(),
    discardRefund: vi.fn(),
    confirmRefund: vi.fn(),
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
