import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { createPanelServices, type Panel, renderPanel } from "./test-support/purchase-panel";
import { compraDeAceite, compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const compraDeDosProductos = { ...compraDeMiel, lines: [lineDeMiel, lineDeAvena] };

function rowTexts(screen: Panel, table: string): string[] {
  return screen
    .getByRole("table", { name: table })
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

test("is named after the supplier the purchase was made from", async () => {
  const screen = await renderPanel(createPanelServices());

  await expect
    .element(screen.getByRole("complementary", { name: "Compra a Distribuidora Andina" }))
    .toBeVisible();
});

test("shows the supplier, the date and the receipt of the purchase", async () => {
  const screen = await renderPanel(createPanelServices());

  const panel = screen.getByRole("complementary");
  await expect.element(panel.getByText("Distribuidora Andina").last()).toBeVisible();
  await expect.element(panel.getByText("14/09/2026")).toBeVisible();
  await expect.element(panel.getByText("Factura B 0001-00001234")).toBeVisible();
  expect(panel.getByText("Nota").query()).toBeNull();
});

test("shows the note of the purchase when it has one", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeAvena });

  await expect.element(screen.getByText("Entrega de la tarde")).toBeVisible();
});

test("lists each line with its quantity, cost paid, unit cost, lot and expiry", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeDosProductos });

  await expect
    .poll(() => rowTexts(screen, "Productos de la compra"))
    .toEqual([
      "Miel pura de abeja 1 kg",
      "Cantidad2 × 12 u (24 u)Costo pagado$ 7.200,00 por paqueteCosto unitario$ 600,00 por uLoteCompra 14/09/2026Vencimiento31/01/2027",
      "Avena arrollada",
      "Cantidad12,500 kgCosto pagado$ 2.000,00 por kgCosto unitario$ 2.000,00 por kgLoteCompra 10/09/2026",
    ]);
});

test("describes each line's product with its brand name and net content", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeAceite });

  await expect.element(screen.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
});

test("writes a line's count of packages the way every amount reads", async () => {
  const screen = await renderPanel(createPanelServices(), {
    purchase: {
      ...compraDeMiel,
      lines: [{ ...lineDeMiel, packages: 1_500, quantity: 18_000_000 }],
    },
  });

  await expect.element(screen.getByText("1.500 × 12 u (18.000 u)")).toBeVisible();
});

test("writes a line of a product sold by weight with each package's weight in kilos", async () => {
  const screen = await renderPanel(createPanelServices(), {
    purchase: {
      ...compraDeAvena,
      lines: [{ ...lineDeAvena, packages: 3, quantityPerPackage: 2_500, quantity: 7_500 }],
    },
  });

  await expect.element(screen.getByText("3 × 2,500 kg (7,500 kg)")).toBeVisible();
});

test("lists the freights linked to the purchase as the cloud answers them", async () => {
  const screen = await renderPanel(createPanelServices());

  await expect.element(screen.getByRole("heading", { name: "Fletes vinculados" })).toBeVisible();
  await expect
    .poll(() => rowTexts(screen, "Fletes vinculados"))
    .toEqual([
      "15/09/2026Flete de la mielTransportes del Valle$ 45.000,00",
      "12/09/2026Viaje a buscar la mielViaje propio · costo estimado$ 12.000,00",
    ]);
});

test("says the purchase has no linked freights when it has none", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeAvena });

  const freights = screen.getByRole("table", { name: "Fletes vinculados" });
  await expect.element(freights.getByText("Sin fletes vinculados")).toBeVisible();
});

test("shows no linked freights when the cloud does not answer them", async () => {
  const screen = await renderPanel(createPanelServices(), {
    purchase: { ...compraDeMiel, freights: null },
  });

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Fletes vinculados" }).query()).toBeNull();
  expect(screen.getByRole("table", { name: "Fletes vinculados" }).query()).toBeNull();
});

test("offers, on each line, the cost, quantity and expiry corrections and the rest in Más acciones", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeDosProductos });

  const honeyRow = screen.getByRole("row").filter({ hasText: "Miel pura de abeja 1 kg" });
  await expect
    .element(honeyRow.getByRole("button", { name: "Corregir el costo de Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(
      honeyRow.getByRole("button", { name: "Corregir la cantidad de Miel pura de abeja 1 kg" }),
    )
    .toBeVisible();
  await expect
    .element(
      honeyRow.getByRole("button", { name: "Corregir el vencimiento de Miel pura de abeja 1 kg" }),
    )
    .toBeVisible();
  expect(honeyRow.getByRole("button", { name: /^Cambiar el producto/ }).query()).toBeNull();
  await userEvent.click(honeyRow.getByRole("button", { name: "Más acciones" }));
  expect(
    page
      .getByRole("menuitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual([
    "Dar otro vencimiento a algunas unidades",
    "Cambiar el producto",
    "Quitar de la compra",
  ]);
});

test("offers no correction to who may not record purchases", async () => {
  const screen = await renderPanel(createPanelServices(), { access: accessWith("freights") });

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Corregir/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("asks to close when its close button is pressed", async () => {
  const onClose = vi.fn();
  const screen = await renderPanel(createPanelServices(), { onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations", async () => {
  const screen = await renderPanel(createPanelServices(), { purchase: compraDeDosProductos });
  await expect.element(screen.getByText("Avena arrollada")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
