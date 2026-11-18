import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { linesPainted, linesPaintedUnder } from "../platform/test-support/code-cells";
import { accessWith } from "../shell/test-support/backoffice-access";
import { productPanelSections } from "./test-support/product-panel-sections";
import { almonds, honey, lavenderOil, pricedAlmonds, retiredHoney } from "./test-support/products";
import { createServices, mockLoaded, renderScreen } from "./test-support/products-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function rowOf(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  return screen.getByRole("row").filter({ hasText: name });
}

async function renderWithPanel(options: Parameters<typeof renderScreen>[2] = {}) {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const screen = await renderScreen(services, () => {}, options);
  return { screen, services };
}

test("opens the panel of the product named, beside the list, and marks its row", async () => {
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
  await expect.element(rowOf(screen, honey.name)).toHaveAttribute("aria-current", "true");
  expect(rowOf(screen, almonds.name).element()).not.toHaveAttribute("aria-current");
  await expect.element(screen.getByText(almonds.name)).toBeVisible();
});

test("shows no panel when no product is named", async () => {
  const { screen } = await renderWithPanel();

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("does not open a panel for a product the list does not show", async () => {
  const { screen } = await renderWithPanel({ openProduct: retiredHoney.id });

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("asks to close a panel naming a product the list does not show", async () => {
  const onPanelChange = vi.fn();

  await renderWithPanel({ openProduct: retiredHoney.id, onPanelChange });

  await vi.waitFor(() => expect(onPanelChange).toHaveBeenCalledExactlyOnceWith(undefined));
});

test("pressing a row asks to open the panel of its product", async () => {
  const onPanelChange = vi.fn();
  const { screen } = await renderWithPanel({ onPanelChange });

  await userEvent.click(screen.getByText(almonds.name));

  expect(onPanelChange).toHaveBeenCalledExactlyOnceWith({ product: almonds.id });
});

test("closing the panel asks to close it", async () => {
  const onPanelChange = vi.fn();
  const { screen } = await renderWithPanel({ openProduct: honey.id, onPanelChange });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onPanelChange).toHaveBeenCalledExactlyOnceWith(undefined);
});

test("the row menu asks to open the panel at the price or at the stock", async () => {
  const onPanelChange = vi.fn();
  const { screen } = await renderWithPanel({ onPanelChange });
  await expect.element(screen.getByText(honey.name)).toBeVisible();

  await userEvent.click(rowOf(screen, honey.name).getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Cambiar el precio" }));
  await userEvent.click(rowOf(screen, honey.name).getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Ver stock y lotes" }));

  expect(onPanelChange).toHaveBeenNthCalledWith(1, { product: honey.id, tab: "price" });
  expect(onPanelChange).toHaveBeenNthCalledWith(2, { product: honey.id, tab: "stock" });
});

test("the panel's tabs follow the person's access and the cloud's recipes", async () => {
  const { screen } = await renderWithPanel({
    openProduct: honey.id,
    access: accessWith("products_and_categories", "recipes"),
    sections: productPanelSections({ assembledProductIds: [honey.id] }),
  });

  await expect.element(screen.getByRole("tab", { name: "Datos" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Receta y producciones" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Precio y costo" }).query()).toBeNull();
});

test("the panel's Editar opens the edit modal of its product, with the panel still there", async () => {
  const { screen } = await renderWithPanel({ openProduct: honey.id });
  const panel = screen.getByRole("complementary", { name: honey.name });

  await userEvent.click(panel.getByRole("button", { name: "Editar" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue(honey.name);
});

test("reads the products list again after the panel changes the product's price", async () => {
  const { screen, services } = await renderWithPanel({ openProduct: honey.id, tab: "price" });
  await expect.element(screen.getByText(`Precio y costo de ${honey.name}`)).toBeVisible();
  expect(services.fetchProducts).toHaveBeenCalledOnce();

  await userEvent.click(screen.getByRole("button", { name: "Guardar un precio de prueba" }));

  await vi.waitFor(() => expect(services.fetchProducts).toHaveBeenCalledTimes(2));
});

test("beside the panel at 1440px, shows the price column whole", async () => {
  await page.viewport(1440, 900);
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  const frame = table.element().closest(".isolate") as HTMLElement;
  const frameRight = () => frame.getBoundingClientRect().right;
  const priceHeader = table.getByRole("columnheader", { name: "Precio" });
  await expect.element(priceHeader).toBeVisible();
  expect(priceHeader.element().getBoundingClientRect().right).toBeLessThanOrEqual(frameRight());
  await expect.element(rowOf(screen, honey.name)).toBeVisible();
  const priceCell = rowOf(screen, honey.name).element().querySelectorAll("td")[5] as HTMLElement;
  expect(priceCell.getBoundingClientRect().right).toBeLessThanOrEqual(frameRight());
});

test("beside the panel at 1440px, fits every column of the list with no sideways scroll", async () => {
  await page.viewport(1440, 900);
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  await expect.element(rowOf(screen, honey.name)).toBeVisible();
  const frame = table.element().closest(".isolate") as HTMLElement;

  expect(screen.getByRole("group", { name: "Productos" }).query()).toBeNull();
  for (const header of table.getByRole("columnheader").elements()) {
    expect(header.getBoundingClientRect().right).toBeLessThanOrEqual(
      frame.getBoundingClientRect().right,
    );
  }
  expect(frame.querySelector("[data-scroll-cue]")).toBeNull();
});

test("beside the panel at 1440px, keeps each price's amount on one line, right-aligned, with no sideways scroll", async () => {
  await page.viewport(1440, 900);
  const services = createServices();
  mockLoaded(services, [{ ...honey, currentUnitPrice: 1176000 }, pricedAlmonds]);
  const screen = await renderScreen(services, () => {}, { openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  const unitPrice = table.getByRole("cell", { name: "$ 11.760,00" });
  const kiloPrice = table.getByRole("cell", { name: "$ 1.200,00 / kg" });
  await expect.element(unitPrice).toBeVisible();
  await expect.element(kiloPrice).toBeVisible();
  const frame = table.element().closest(".isolate") as HTMLElement;

  expect(linesPainted(unitPrice.element() as HTMLElement)).toBe(1);
  expect(
    linesPainted(kiloPrice.getByText("$ 1.200,00", { exact: true }).element() as HTMLElement),
  ).toBe(1);
  for (const price of [unitPrice, kiloPrice, table.getByRole("columnheader", { name: "Precio" })]) {
    expect(getComputedStyle(price.element()).textAlign).toBe("right");
  }
  expect(screen.getByRole("group", { name: "Productos" }).query()).toBeNull();
  expect(table.element().getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.getBoundingClientRect().right,
  );
});

test("in a window too narrow for the list beside the panel, scrolls it and marks the cut edge", async () => {
  document.body.style.width = "820px";
  onTestFinished(() => {
    document.body.style.removeProperty("width");
  });
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  await expect.element(rowOf(screen, honey.name)).toBeVisible();
  const frame = table.element().closest(".isolate") as HTMLElement;

  await expect.poll(() => frame.querySelector("[data-scroll-cue='end']")).not.toBeNull();
});

test("squeezed beside the panel, keeps a product's barcodes and the count of the others on one line", async () => {
  await page.viewport(1000, 900);
  const services = createServices();
  mockLoaded(services, [lavenderOil, honey]);
  const screen = await renderScreen(services, () => {}, { openProduct: honey.id });

  const cell = screen.getByRole("cell", { name: "7790001234574 +1" });
  await expect.element(cell).toBeVisible();
  expect(linesPainted(cell.element() as HTMLElement)).toBe(1);
});

test("beside the panel in a wide window, keeps Unidad and Precio, with its unit, on one line and gives the name only what is left", async () => {
  document.body.style.width = "2048px";
  onTestFinished(() => {
    document.body.style.removeProperty("width");
  });
  const services = createServices();
  const longName =
    "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregados, Envasado en Botella de Vidrio de 900 g para Gastronomía";
  mockLoaded(services, [{ ...pricedAlmonds, name: longName }, honey]);
  const screen = await renderScreen(services, () => {}, { openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  await expect.element(rowOf(screen, honey.name)).toBeVisible();
  const element = table.element() as HTMLElement;

  expect(linesPaintedUnder(element, "Unidad")).toEqual([1, 1]);
  expect(linesPaintedUnder(element, "Precio")).toEqual([1, 1]);
  const cells = [...(element.querySelector("tbody tr") as HTMLElement).querySelectorAll("td")];
  const othersWidth = cells
    .slice(1)
    .reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
  const frame = element.closest(".isolate") as HTMLElement;
  expect((cells[0] as HTMLElement).getBoundingClientRect().width).toBeGreaterThanOrEqual(
    frame.getBoundingClientRect().width - othersWidth - 4,
  );
});

test("beside the panel at 1440px, gives a long name at least the room it had before, keeps every amount whole and does not scroll sideways", async () => {
  const services = createServices();
  const longName =
    "Aceite de girasol alto oleico prensado en frio con aromas naturales sin aditivos en botella de vidrio de 900 g para uso diario en casa y en el local";
  mockLoaded(services, [{ ...pricedAlmonds, name: longName }, honey]);
  const screen = await renderScreen(services, () => {}, { openProduct: honey.id });

  const table = screen.getByRole("table", { name: "Productos" });
  await expect.element(rowOf(screen, honey.name)).toBeVisible();
  const element = table.element() as HTMLElement;
  const frame = element.closest(".isolate") as HTMLElement;
  const cells = [...(element.querySelector("tbody tr") as HTMLElement).querySelectorAll("td")];
  const name = cells[0] as HTMLElement;
  const amount = (cells[5] as HTMLElement).querySelector("span span") as HTMLElement;

  expect(Math.round(frame.getBoundingClientRect().width)).toBe(840);
  expect(frame.querySelector("[data-scroll-cue]")).toBeNull();
  expect(name.getBoundingClientRect().width).toBeGreaterThanOrEqual(108);
  expect(linesPainted(name.querySelector("div div") as HTMLElement)).toBeLessThanOrEqual(15);
  expect(linesPainted(amount)).toBe(1);
});
