import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { productPanelSections } from "./test-support/product-panel-sections";
import { almonds, honey, retiredHoney } from "./test-support/products";
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
  await expect.element(screen.getByRole("tab", { name: "Receta y tandas" })).toBeVisible();
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
