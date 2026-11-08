import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  renderScreen,
  type ScreenOptions,
} from "./test-support/purchases-list-screen";

const SUPPLIER_ID = compraDeMiel.supplier.id;

function servicesWithPurchase() {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [compraDeMiel] });
  return services;
}

function renderFiltered(services = servicesWithPurchase(), options: ScreenOptions = {}) {
  return renderScreen(services, {
    supplierFilter: { supplierId: SUPPLIER_ID, onClear: () => {} },
    ...options,
  });
}

test("asks the cloud only for the purchases of the supplier it is filtered by", async () => {
  const services = servicesWithPurchase();

  await renderFiltered(services);

  await vi.waitFor(() =>
    expect(services.fetchPurchases).toHaveBeenCalledWith({ supplierId: SUPPLIER_ID }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderFiltered(servicesWithPurchase(), {
    supplierFilter: { supplierId: SUPPLIER_ID, onClear },
  });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }));

  expect(onClear).toHaveBeenCalledTimes(1);
});

test("shows no supplier filter when it is not filtered by a supplier", async () => {
  const screen = await renderScreen(servicesWithPurchase());

  await expect.element(screen.getByRole("table", { name: "Compras" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});
