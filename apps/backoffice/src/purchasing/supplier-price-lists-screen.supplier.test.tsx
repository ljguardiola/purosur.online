import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { supplierPriceListsFilters } from "./supplier-price-lists-filters";
import { SupplierPriceListsScreen } from "./supplier-price-lists-screen";
import type { SupplierPriceListsScreenServices } from "./supplier-price-lists-services";
import { READ_LIST } from "./test-support/supplier-price-lists";

const SUPPLIER_ID = READ_LIST.supplier.id;

function createServices(): SupplierPriceListsScreenServices {
  return {
    fetchSupplierPriceLists: vi.fn().mockResolvedValue({ kind: "ok", value: [READ_LIST] }),
    uploadSupplierPriceList: vi.fn(),
    loadSupplierPriceListWebPage: vi.fn(),
    refreshSupplierPriceList: vi.fn(),
    fetchSuppliers: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    createSupplier: vi.fn(),
  };
}

function renderScreen(
  services: SupplierPriceListsScreenServices,
  supplierFilter?: { supplierId: string; onClear: () => void },
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <SupplierPriceListsScreen
          access={ADMINISTRATOR_ACCESS}
          services={services}
          filters={supplierPriceListsFilters.parse({})}
          onFiltersChange={() => {}}
          onOpenReview={() => {}}
          onSessionEnded={() => {}}
          {...(supplierFilter === undefined ? {} : { supplierFilter })}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("asks the cloud only for the price lists of the supplier it is filtered by", async () => {
  const services = createServices();

  await renderScreen(services, { supplierId: SUPPLIER_ID, onClear: () => {} });

  await vi.waitFor(() =>
    expect(services.fetchSupplierPriceLists).toHaveBeenCalledWith({ supplierId: SUPPLIER_ID }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderScreen(createServices(), { supplierId: SUPPLIER_ID, onClear });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }));

  expect(onClear).toHaveBeenCalledTimes(1);
});

test("shows no supplier filter when it is not filtered by a supplier", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("table", { name: "Listas de proveedores" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});
