import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPurchasesTab } from "./supplier-purchases-tab";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";

const SUPPLIER_ID = "5a900000-0000-4000-8000-000000000001";

function renderTab(services = createSupplierPanelServices(), onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <SupplierPurchasesTab
        supplierId={SUPPLIER_ID}
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </FieldSizeProvider>,
  );
}

test("asks the cloud for the purchases of the supplier", async () => {
  const services = createSupplierPanelServices();

  await renderTab(services);

  await vi.waitFor(() =>
    expect(services.fetchPurchases).toHaveBeenCalledWith({ supplierId: SUPPLIER_ID }),
  );
});

test("lists the supplier's purchases with their date and receipt", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [compraDeMiel, compraDeAvena],
  });

  const screen = await renderTab(services);

  const table = screen.getByRole("table", { name: "Compras del proveedor" });
  await expect.element(table).toBeVisible();
  expect(table.getByRole("row").elements()).toHaveLength(3);
  await expect.element(table.getByText("14/09/2026")).toBeVisible();
  await expect.element(table.getByText("Factura B 0001-00001234")).toBeVisible();
});

test("tells that the supplier has no purchases", async () => {
  const screen = await renderTab();

  await expect.element(screen.getByText("Sin compras")).toBeVisible();
});

test("offers to retry when the purchases could not be read", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "failed" });

  const screen = await renderTab(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("links to every purchase of the supplier", async () => {
  const screen = await renderTab();

  await expect
    .element(screen.getByRole("link", { name: "Ver todos" }))
    .toHaveAttribute("href", `/purchases?supplier=${SUPPLIER_ID}`);
});

test("ends the session when the cloud refuses it", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderTab(services, onSessionEnded);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("has no accessibility violations", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [compraDeMiel] });

  const screen = await renderTab(services);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
