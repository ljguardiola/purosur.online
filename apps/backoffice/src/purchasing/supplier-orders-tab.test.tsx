import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { SupplierOrdersTab } from "./supplier-orders-tab";
import { CANCELLED_SUMMARY, DRAFT_SUMMARY, SENT_SUMMARY } from "./test-support/purchase-orders";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";

const SUPPLIER_ID = "5a900000-0000-4000-8000-000000000001";

function renderTab(services = createSupplierPanelServices(), onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <SupplierOrdersTab
        supplierId={SUPPLIER_ID}
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </FieldSizeProvider>,
  );
}

test("asks the cloud for the orders of the supplier, every state", async () => {
  const services = createSupplierPanelServices();

  await renderTab(services);

  await vi.waitFor(() =>
    expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("ALL", { supplierId: SUPPLIER_ID }),
  );
});

test("lists the supplier's orders with their date, total and state", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [SENT_SUMMARY, CANCELLED_SUMMARY],
  });

  const screen = await renderTab(services);

  const table = screen.getByRole("table", { name: "Pedidos del proveedor" });
  await expect.element(table).toBeVisible();
  expect(table.getByRole("row").elements()).toHaveLength(3);
  await expect.element(table.getByText("10/03/2026")).toBeVisible();
  await expect.element(table.getByText("Enviado")).toBeVisible();
  await expect.element(table.getByText("Cancelado")).toBeVisible();
});

test("tells that the supplier has no orders", async () => {
  const screen = await renderTab();

  await expect.element(screen.getByText("Sin pedidos")).toBeVisible();
});

test("offers to retry when the orders could not be read", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "failed" });

  const screen = await renderTab(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("links to every order of the supplier", async () => {
  const screen = await renderTab();

  await expect
    .element(screen.getByRole("link", { name: "Ver todos" }))
    .toHaveAttribute("href", `/purchase-orders?supplier=${SUPPLIER_ID}`);
});

test("ends the session when the cloud refuses it", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderTab(services, onSessionEnded);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("has no accessibility violations", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "ok", value: [DRAFT_SUMMARY] });

  const screen = await renderTab(services);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
