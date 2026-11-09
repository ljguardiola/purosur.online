import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { DRAFT_SUMMARY, SUPPLIER_ID } from "./test-support/purchase-orders";
import { createServices, renderScreen } from "./test-support/purchase-orders-list-screen";

function servicesWithOrders(orders = [DRAFT_SUMMARY]) {
  return createServices({
    fetchPurchaseOrders: vi.fn().mockResolvedValue({ kind: "ok", value: orders }),
  });
}

test("asks the cloud only for the orders of the supplier it is filtered by", async () => {
  const services = servicesWithOrders();

  await renderScreen(services, { supplierFilter: { supplierId: SUPPLIER_ID, onClear: () => {} } });

  await vi.waitFor(() =>
    expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("ALL", { supplierId: SUPPLIER_ID }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderScreen(servicesWithOrders([]), {
    supplierFilter: { supplierId: SUPPLIER_ID, onClear },
  });

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
    supplierFilter: { supplierId: SUPPLIER_ID, onClear: () => {} },
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByText("Todavía no hay pedidos").query()).toBeNull();
});
