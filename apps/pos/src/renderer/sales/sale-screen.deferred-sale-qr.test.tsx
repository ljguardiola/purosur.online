import { describe, expect, it, vi } from "vitest";
import { renderScreen } from "./test-support/sale-screen";

const DEFERRED_SALE_QR = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

describe("SaleScreen reading a deferred sale's QR", () => {
  it("opens the deferred-sale screen with the reading instead of scanning it as a product", async () => {
    const scanProduct = vi.fn(async () => ({ kind: "unavailable" as const }));
    const { screen, readBarcode } = await renderScreen({ scanProduct });

    readBarcode(DEFERRED_SALE_QR);

    await expect.poll(() => screen.router.state.location.pathname).toBe("/deferred-sale");
    expect(screen.router.state.location.search).toEqual({ reading: DEFERRED_SALE_QR });
    expect(scanProduct).not.toHaveBeenCalled();
  });

  it("scans a code that is not a deferred sale's QR as a product", async () => {
    const scanProduct = vi.fn(async () => ({ kind: "not_found" as const }));
    const { readBarcode } = await renderScreen({ scanProduct });

    readBarcode("7790001");

    await vi.waitFor(() => expect(scanProduct.mock.calls).toEqual([["7790001"]]));
  });
});
