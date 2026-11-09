import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { purchaseOrdersFilters } from "./purchase-orders-filters";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { createPanelServices } from "./test-support/purchase-order-panel";
import { DRAFT_SUMMARY, SUPPLIER_ID } from "./test-support/purchase-orders";

function renderScreen(
  services: PurchaseOrdersScreenServices,
  supplierFilter?: { supplierId: string; onClear: () => void },
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrdersScreen
          services={services}
          filters={purchaseOrdersFilters.parse({})}
          onFiltersChange={() => {}}
          access={ADMINISTRATOR_ACCESS}
          openOrder={undefined}
          received={false}
          onOpenOrderChange={() => {}}
          onReceive={() => {}}
          onOpenPurchases={() => {}}
          onReceivedNoticeDismissed={() => {}}
          onSessionEnded={() => {}}
          {...(supplierFilter === undefined ? {} : { supplierFilter })}
        />
      </main>
    </FieldSizeProvider>,
  );
}

function servicesWithOrders(orders = [DRAFT_SUMMARY]) {
  return {
    fetchPurchaseOrders: vi.fn().mockResolvedValue({ kind: "ok", value: orders }),
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
    fetchPendingPurchaseOrdersReport: vi.fn(),
    fetchReceiptDifferencesReport: vi.fn(),
    ...createPanelServices(),
  } satisfies PurchaseOrdersScreenServices;
}

test("asks the cloud only for the orders of the supplier it is filtered by", async () => {
  const services = servicesWithOrders();

  await renderScreen(services, { supplierId: SUPPLIER_ID, onClear: () => {} });

  await vi.waitFor(() =>
    expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("ALL", { supplierId: SUPPLIER_ID }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderScreen(servicesWithOrders([]), { supplierId: SUPPLIER_ID, onClear });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }));

  expect(onClear).toHaveBeenCalledTimes(1);
});

test("shows no supplier filter when it is not filtered by a supplier", async () => {
  const screen = await renderScreen(servicesWithOrders());

  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});

test("tells that the supplier filter hides every order when the supplier has none", async () => {
  const screen = await renderScreen(servicesWithOrders([]), {
    supplierId: SUPPLIER_ID,
    onClear: () => {},
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByText("Todavía no hay pedidos").query()).toBeNull();
});
