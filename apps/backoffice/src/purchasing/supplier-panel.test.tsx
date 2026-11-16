import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPanel } from "./supplier-panel";
import type { SupplierPanelServices } from "./supplier-panel-services";
import { envioDesdeBuenosAires } from "./test-support/freights";
import { SENT_SUMMARY } from "./test-support/purchase-orders";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";
import { READ_LIST } from "./test-support/supplier-price-lists";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos, cerealera } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

function renderPanel(
  supplier = andina,
  {
    access = ADMINISTRATOR_ACCESS,
    tab,
    services = createSupplierPanelServices(),
    onClose = () => {},
    onEdit = () => {},
    onDeactivate = () => {},
    onReactivate = () => {},
  }: {
    access?: BackofficeAccess;
    tab?: string | undefined;
    services?: SupplierPanelServices;
    onClose?: () => void;
    onEdit?: () => void;
    onDeactivate?: () => void;
    onReactivate?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <SupplierPanel
        supplier={supplier}
        access={access}
        tab={tab}
        services={services}
        onSessionEnded={() => {}}
        onClose={onClose}
        onEdit={onEdit}
        onDeactivate={onDeactivate}
        onReactivate={onReactivate}
      />
    </FieldSizeProvider>,
  );
}

async function expectTabs(screen: Awaited<ReturnType<typeof renderPanel>>, names: string[]) {
  const tabs = screen.getByRole("tablist", { name: "Secciones del proveedor" }).getByRole("tab");
  await expect.element(tabs.first()).toBeVisible();
  expect(tabs.elements()).toHaveLength(names.length);
  for (const [index, name] of names.entries()) {
    await expect.element(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

test("shows the supplier's data under its name, on Datos by default", async () => {
  const screen = await renderPanel();

  const panel = screen.getByRole("complementary", { name: andina.name });
  await expect.element(panel.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(panel.getByText(FICTIONAL_CUIT)).toBeVisible();
  await expect.element(panel.getByText("Marta Pérez · 11 5555-0100")).toBeVisible();
  await expect.element(panel.getByText("Entrega los martes")).toBeVisible();
  await expect.element(panel.getByText("Activo")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a dash for the data a supplier does not have", async () => {
  const screen = await renderPanel(granos);

  const panel = screen.getByRole("complementary", { name: granos.name });
  expect(
    panel
      .getByText("—")
      .elements()
      .map((element) => element.textContent),
  ).toHaveLength(3);
});

test("shows the five tabs in order to a person who may see them all", async () => {
  const screen = await renderPanel();

  await expectTabs(screen, ["Datos", "Listas", "Pedidos", "Compras", "Fletes"]);
});

test("shows no Fletes tab to a person without the freights capability", async () => {
  const screen = await renderPanel(andina, {
    access: accessWith("suppliers", "supplier_price_lists", "purchases"),
  });

  await expect.element(screen.getByRole("tablist")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Fletes" }).query()).toBeNull();
});

test.each([
  ["lists", "Listas"],
  ["orders", "Pedidos"],
  ["purchases", "Compras"],
  ["freights", "Fletes"],
] as const)("selects the tab named by %s", async (tab, name) => {
  const screen = await renderPanel(andina, { tab });

  await expect.element(screen.getByRole("tab", { name, selected: true })).toBeVisible();
});

test("selects the first tab the person may see when the tab named is not one of them", async () => {
  const screen = await renderPanel(andina, {
    access: accessWith("supplier_price_lists", "purchases"),
    tab: "freights",
  });

  await expect.element(screen.getByRole("tab", { name: "Listas", selected: true })).toBeVisible();
});

test("offers editing and deactivating an active supplier on Datos", async () => {
  const onEdit = vi.fn();
  const onDeactivate = vi.fn();
  const screen = await renderPanel(andina, { onEdit, onDeactivate });

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Desactivar" }));

  expect(onEdit).toHaveBeenCalledOnce();
  expect(onDeactivate).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Reactivar" }).query()).toBeNull();
});

test("offers reactivating an inactive supplier on Datos", async () => {
  const onReactivate = vi.fn();
  const screen = await renderPanel(cerealera, { onReactivate });

  await expect.element(screen.getByText("Inactivo")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reactivar" }));

  expect(onReactivate).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
});

test("offers no data actions on the other tabs", async () => {
  const screen = await renderPanel(andina, { tab: "lists" });

  await expect.element(screen.getByRole("tab", { name: "Listas", selected: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
});

test("asks to close from its close button", async () => {
  const onClose = vi.fn();
  const screen = await renderPanel(andina, { onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledOnce();
});

test.each([
  ["lists", "Sin listas de precios"],
  ["orders", "Sin pedidos"],
  ["purchases", "Sin compras"],
  ["freights", "Sin fletes"],
] as const)("shows the supplier's records on the %s tab", async (tab, emptyTitle) => {
  const screen = await renderPanel(andina, { tab });

  await expect.element(screen.getByText(emptyTitle, { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Ver todos" }))
    .toHaveAttribute("href", expect.stringContaining(`supplier=${andina.id}`));
});

function servicesWithOneRecordEach() {
  const services = createSupplierPanelServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "ok", value: [READ_LIST] });
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "ok", value: [SENT_SUMMARY] });
  vi.mocked(services.fetchFreights).mockResolvedValue({
    kind: "ok",
    value: {
      items: [envioDesdeBuenosAires],
      count: 1,
      totalCents: envioDesdeBuenosAires.amountCents,
    },
  });
  return services;
}

test.each([
  ["lists", "Listas de precios del proveedor", ["Fecha de la lista", "Estado"]],
  ["orders", "Pedidos del proveedor", ["Total esperado", "Estado"]],
  ["freights", "Fletes del proveedor", ["Flete", "Monto"]],
] as const)(
  "stacks the supplier's records on the %s tab into a list inside the panel, with no sideways scroll",
  async (tab, name, terms) => {
    const screen = await renderPanel(andina, { tab, services: servicesWithOneRecordEach() });

    const records = screen.getByRole("list", { name });
    await expect.element(records.getByRole("listitem")).toBeVisible();
    expect(screen.getByRole("region", { name }).query()).toBeNull();
    const item = records.getByRole("listitem").element();
    expect([...item.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(terms);
    const right = screen
      .getByRole("complementary", { name: andina.name })
      .element()
      .getBoundingClientRect().right;
    for (const value of item.querySelectorAll("dd")) {
      expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(right);
    }
  },
);

test("reads no records of the tabs it does not show", async () => {
  const services = createSupplierPanelServices();

  const screen = await renderPanel(andina, { services });
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();

  expect(services.fetchSupplierPriceLists).not.toHaveBeenCalled();
  expect(services.fetchPurchaseOrders).not.toHaveBeenCalled();
  expect(services.fetchPurchases).not.toHaveBeenCalled();
  expect(services.fetchFreights).not.toHaveBeenCalled();
});
