import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FreightsListScreen } from "./freights-list-screen";
import type { FreightsListScreenServices } from "./freights-list-services";
import { freightsListFilters } from "./routes";
import { quarterFreightReport } from "./test-support/freight-report-fixtures";
import { envioDesdeBuenosAires, linkablePurchases } from "./test-support/freights";

const SUPPLIER_ID = envioDesdeBuenosAires.purchases[0]?.supplier.id ?? "";
const NO_FREIGHTS = { items: [], count: 0, totalCents: 0 };

function createServices(
  value = { items: [envioDesdeBuenosAires], count: 1, totalCents: 1_850_000 },
): FreightsListScreenServices {
  return {
    fetchFreights: vi.fn().mockResolvedValue({ kind: "ok", value }),
    fetchFreightReport: vi.fn().mockResolvedValue({ kind: "ok", value: quarterFreightReport }),
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
    fetchLinkablePurchases: vi.fn().mockResolvedValue({ kind: "ok", value: linkablePurchases }),
    recordFreight: vi.fn(),
    editFreight: vi.fn(),
  };
}

function renderScreen(
  services: FreightsListScreenServices,
  supplierFilter?: { supplierId: string; onClear: () => void },
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightsListScreen
          services={services}
          filters={freightsListFilters.parse({})}
          onFiltersChange={() => {}}
          onSessionEnded={() => {}}
          {...(supplierFilter === undefined ? {} : { supplierFilter })}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("asks the cloud only for the freights of the supplier it is filtered by", async () => {
  const services = createServices();

  await renderScreen(services, { supplierId: SUPPLIER_ID, onClear: () => {} });

  await vi.waitFor(() =>
    expect(services.fetchFreights).toHaveBeenCalledWith({
      period: 90,
      search: "",
      supplierId: SUPPLIER_ID,
    }),
  );
});

test("names the supplier it is filtered by and asks to clear the filter when it is pressed", async () => {
  const onClear = vi.fn();
  const screen = await renderScreen(createServices(NO_FREIGHTS), {
    supplierId: SUPPLIER_ID,
    onClear,
  });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }));

  expect(onClear).toHaveBeenCalledTimes(1);
});

test("shows no supplier filter when it is not filtered by a supplier", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("table", { name: "Fletes" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});

test("tells that the supplier filter hides every freight when the supplier has none", async () => {
  const screen = await renderScreen(createServices(NO_FREIGHTS), {
    supplierId: SUPPLIER_ID,
    onClear: () => {},
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByText(/^Sin fletes/).query()).toBeNull();
});
