import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { PurchaseOrderScreen } from "../purchase-order-screen";
import type { PurchaseOrderScreenServices } from "../purchase-order-services";
import { DRAFT_ORDER, ORDER_ID } from "./purchase-orders";
import { purchasableProducts } from "./purchase-products";

export function createServices(
  overrides: Partial<PurchaseOrderScreenServices> = {},
): PurchaseOrderScreenServices {
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

export type ScreenOptions = {
  access?: BackofficeAccess;
  onBack?: () => void;
  onSessionEnded?: () => void;
  onReceive?: () => void;
  onOpenPurchases?: () => void;
  received?: boolean;
  onNoticeDismissed?: () => void;
};

export function renderScreen(
  services: PurchaseOrderScreenServices,
  {
    access = ADMINISTRATOR_ACCESS,
    onBack = () => {},
    onSessionEnded = () => {},
    onReceive = () => {},
    onOpenPurchases = () => {},
    received = false,
    onNoticeDismissed = () => {},
  }: ScreenOptions = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrderScreen
          orderId={ORDER_ID}
          access={access}
          services={services}
          onBack={onBack}
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

export type Screen = Awaited<ReturnType<typeof renderScreen>>;

export async function loaded(services: PurchaseOrderScreenServices, options: ScreenOptions = {}) {
  const screen = await renderScreen(services, options);
  await expect
    .element(screen.getByRole("heading", { name: "Pedido a Distribuidora Andina", level: 1 }))
    .toBeVisible();
  return screen;
}
