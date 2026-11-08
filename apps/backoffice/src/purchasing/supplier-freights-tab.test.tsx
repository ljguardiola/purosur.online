import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { SupplierFreightsTab } from "./supplier-freights-tab";
import { envioDesdeBuenosAires, retiroEnElMolino } from "./test-support/freights";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";

const SUPPLIER_ID = "5a900000-0000-4000-8000-000000000001";

function renderTab(services = createSupplierPanelServices(), onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <SupplierFreightsTab
        supplierId={SUPPLIER_ID}
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </FieldSizeProvider>,
  );
}

test("asks the cloud for the freights of the supplier over the period the full list opens on", async () => {
  const services = createSupplierPanelServices();

  await renderTab(services);

  await vi.waitFor(() =>
    expect(services.fetchFreights).toHaveBeenCalledWith({
      period: 90,
      search: "",
      supplierId: SUPPLIER_ID,
    }),
  );
});

test("lists the supplier's freights with their date, description and amount", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchFreights).mockResolvedValue({
    kind: "ok",
    value: { items: [envioDesdeBuenosAires, retiroEnElMolino], count: 2, totalCents: 2_750_000 },
  });

  const screen = await renderTab(services);

  const table = screen.getByRole("table", { name: "Fletes del proveedor" });
  await expect.element(table).toBeVisible();
  await expect.poll(() => table.getByRole("row").elements()).toHaveLength(3);
  await expect.element(table.getByText("Envío desde Buenos Aires")).toBeVisible();
  await expect.element(table.getByText("12/09/2026")).toBeVisible();
});

test("tells that the supplier has no freights", async () => {
  const screen = await renderTab();

  await expect.element(screen.getByText("Sin fletes")).toBeVisible();
});

test("offers to retry when the freights could not be read", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchFreights).mockResolvedValue({ kind: "failed" });

  const screen = await renderTab(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("links to every freight of the supplier", async () => {
  const screen = await renderTab();

  await expect
    .element(screen.getByRole("link", { name: "Ver todos" }))
    .toHaveAttribute("href", `/freights?supplier=${SUPPLIER_ID}`);
});

test("ends the session when the cloud refuses it", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchFreights).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderTab(services, onSessionEnded);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("has no accessibility violations", async () => {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchFreights).mockResolvedValue({
    kind: "ok",
    value: { items: [envioDesdeBuenosAires], count: 1, totalCents: 1_850_000 },
  });

  const screen = await renderTab(services);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
