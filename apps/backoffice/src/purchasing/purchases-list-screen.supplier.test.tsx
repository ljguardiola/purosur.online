import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  renderScreen,
  type ScreenOptions,
} from "./test-support/purchases-list-screen";

const SUPPLIER_ID = compraDeMiel.supplier.id;

function servicesWithPurchases(purchases = [compraDeMiel]) {
  const services = createServices({
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
  });
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: purchases });
  return services;
}

function renderFiltered(services = servicesWithPurchases(), options: ScreenOptions = {}) {
  return renderScreen(services, {
    supplierFilter: { supplierId: SUPPLIER_ID, onClear: () => {} },
    ...options,
  });
}

test("asks the cloud only for the purchases of the supplier it is filtered by", async () => {
  const services = servicesWithPurchases();

  await renderFiltered(services);

  await vi.waitFor(() =>
    expect(services.fetchPurchases).toHaveBeenCalledWith({ supplierId: SUPPLIER_ID }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderFiltered(servicesWithPurchases([]), {
    supplierFilter: { supplierId: SUPPLIER_ID, onClear },
  });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }));

  expect(onClear).toHaveBeenCalledTimes(1);
});

test("shows no supplier filter when it is not filtered by a supplier", async () => {
  const screen = await renderScreen(servicesWithPurchases());

  await expect.element(screen.getByRole("table", { name: "Compras" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});

test("tells that the supplier filter hides every purchase when the supplier has none", async () => {
  const screen = await renderFiltered(servicesWithPurchases([]));

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByText("Todavía no hay compras registradas").query()).toBeNull();
});
