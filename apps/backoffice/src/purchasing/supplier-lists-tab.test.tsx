import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { SupplierListsTab } from "./supplier-lists-tab";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";
import { READ_LIST, REVIEWED_LIST } from "./test-support/supplier-price-lists";

const SUPPLIER_ID = "5a900000-0000-4000-8000-000000000001";

function renderTab(services = createSupplierPanelServices(), onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <SupplierListsTab
        supplierId={SUPPLIER_ID}
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </FieldSizeProvider>,
  );
}

test("asks the cloud for the price lists of the supplier", async () => {
  const services = createSupplierPanelServices();

  await renderTab(services);

  await vi.waitFor(() =>
    expect(services.fetchSupplierPriceLists).toHaveBeenCalledWith({ supplierId: SUPPLIER_ID }),
  );
});

test("lists the supplier's price lists with their file, date and state", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({
    kind: "ok",
    value: [READ_LIST, REVIEWED_LIST],
  });

  const screen = await renderTab(services);

  const table = screen.getByRole("table", { name: "Listas de precios del proveedor" });
  await expect.element(table).toBeVisible();
  await expect.poll(() => table.getByRole("row").elements()).toHaveLength(3);
  await expect.element(table.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(table.getByText("25/09/2026")).toBeVisible();
});

test("tells that the supplier has no price lists", async () => {
  const screen = await renderTab();

  await expect.element(screen.getByText("Sin listas de precios")).toBeVisible();
});

test("offers to retry when the price lists could not be read", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "failed" });

  const screen = await renderTab(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("links to every price list of the supplier", async () => {
  const screen = await renderTab();

  await expect
    .element(screen.getByRole("link", { name: "Ver todos" }))
    .toHaveAttribute("href", `/suppliers/price-lists?supplier=${SUPPLIER_ID}`);
});

test("ends the session when the cloud refuses it", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderTab(services, onSessionEnded);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("has no accessibility violations", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "ok", value: [READ_LIST] });

  const screen = await renderTab(services);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
