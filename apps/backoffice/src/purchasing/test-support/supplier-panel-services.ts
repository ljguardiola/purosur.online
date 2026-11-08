import { vi } from "vitest";
import type { SupplierPanelServices } from "../supplier-panel-services";

export function createSupplierPanelServices(): SupplierPanelServices {
  return {
    fetchSupplierPriceLists: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchPurchaseOrders: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchPurchases: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFreights: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { items: [], count: 0, totalCents: 0 } }),
  };
}
