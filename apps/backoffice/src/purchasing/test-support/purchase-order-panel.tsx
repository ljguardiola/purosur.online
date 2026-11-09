import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { PurchaseOrderPanel } from "../purchase-order-panel";
import type { PurchaseOrderPanelServices } from "../purchase-order-panel-services";
import { DRAFT_ORDER, ORDER_ID } from "./purchase-orders";
import { purchasableProducts } from "./purchase-products";

export function createPanelServices(
  overrides: Partial<PurchaseOrderPanelServices> = {},
): PurchaseOrderPanelServices {
  return {
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: DRAFT_ORDER },
    }),
    fetchPurchaseChoices: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { suppliers: [], products: purchasableProducts, today: "2026-09-16" },
    }),
    editPurchaseOrderLines: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
    sharePurchaseOrder: vi.fn(),
    fetchPurchaseOrderPdf: vi.fn(),
    fetchPurchaseOrderText: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", text: "Pedido a Distribuidora Andina" },
    }),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export type PanelOptions = {
  access?: BackofficeAccess;
  onClose?: () => void;
  onSessionEnded?: () => void;
  onReceive?: () => void;
  onOpenPurchases?: () => void;
  received?: boolean;
  onNoticeDismissed?: () => void;
};

export function renderPanel(
  services: PurchaseOrderPanelServices,
  {
    access = ADMINISTRATOR_ACCESS,
    onClose = () => {},
    onSessionEnded = () => {},
    onReceive = () => {},
    onOpenPurchases = () => {},
    received = false,
    onNoticeDismissed = () => {},
  }: PanelOptions = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrderPanel
          orderId={ORDER_ID}
          access={access}
          services={services}
          onClose={onClose}
          onReceive={onReceive}
          onOpenPurchases={onOpenPurchases}
          received={received}
          onNoticeDismissed={onNoticeDismissed}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

export type Panel = Awaited<ReturnType<typeof renderPanel>>;

export async function loaded(services: PurchaseOrderPanelServices, options: PanelOptions = {}) {
  const screen = await renderPanel(services, options);
  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();
  return screen;
}
