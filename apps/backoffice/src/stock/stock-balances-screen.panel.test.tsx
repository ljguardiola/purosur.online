import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { linesPainted } from "../platform/test-support/code-cells";
import { accessWith } from "../shell/test-support/backoffice-access";
import { listed, type RenderOptions, renderScreen } from "./test-support/stock-balances-screen";
import { almonds, honey, oats } from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function rowOf(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  return screen.getByRole("row").filter({ hasText: name });
}

async function renderWithPanel(options: RenderOptions = {}, services = listed()) {
  const screen = await renderScreen(services, options);
  return { screen, services };
}

test("opens the panel of the product named beside the list, and marks its row", async () => {
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
  await expect.element(rowOf(screen, honey.name)).toHaveAttribute("aria-current", "true");
  expect(rowOf(screen, almonds.name).element()).not.toHaveAttribute("aria-current");
  await expect.element(screen.getByRole("table", { name: "Saldos" })).toBeVisible();
});

test("shows no panel when no product is named", async () => {
  const { screen } = await renderWithPanel();

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("does not open a panel for a product the list does not show, and asks to close it", async () => {
  const onOpenProductChange = vi.fn();

  const { screen } = await renderWithPanel({ openProduct: oats.id, onOpenProductChange });

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
  await vi.waitFor(() => expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(undefined));
});

test("pressing a row asks to open the panel of its product", async () => {
  const onOpenProductChange = vi.fn();
  const { screen } = await renderWithPanel({ onOpenProductChange });

  await userEvent.click(screen.getByText(almonds.name));

  expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(almonds.id);
});

test("closing the panel asks to close it", async () => {
  const onOpenProductChange = vi.fn();
  const { screen } = await renderWithPanel({ openProduct: honey.id, onOpenProductChange });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(undefined);
});

test("offers no button to open the lots under a row", async () => {
  const { screen } = await renderWithPanel();

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("button", { name: /Ver los lotes de/ }).query()).toBeNull();
});

test("shows the product's balance and lots in the panel", async () => {
  const { screen } = await renderWithPanel({ openProduct: almonds.id });

  const panel = screen.getByRole("complementary", { name: almonds.name });
  await expect.element(panel.getByText("12,150 kg")).toBeVisible();
  await expect.element(panel.getByText("Compra 12/09/2026")).toBeVisible();
});

test("shows the product's movements in the panel to a person who may count", async () => {
  const { screen } = await renderWithPanel({
    openProduct: almonds.id,
    access: accessWith("stock_area", "stock_balances", "stock_counts"),
  });

  const panel = screen.getByRole("complementary", { name: almonds.name });
  await expect.element(panel.getByText("Sin recuentos", { exact: true })).toBeVisible();
});

test("beside the panel, gives a long product name the room the figures do not need and keeps the figures whole", async () => {
  await page.viewport(1440, 900);
  const longName =
    "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregado 900 g";
  const { screen } = await renderWithPanel(
    { openProduct: almonds.id },
    listed([{ ...almonds, name: longName }, honey]),
  );

  const table = screen.getByRole("table", { name: "Saldos" });
  const name = table.getByText(/Cuidadosamente/).element() as HTMLElement;
  const widthOf = (title: string) =>
    table.getByRole("columnheader", { name: title }).element().getBoundingClientRect().width;

  expect(linesPainted(name)).toBeLessThanOrEqual(3);
  for (const figures of ["Saldo", "Costo unitario", "Valorizado"]) {
    expect(widthOf("Producto")).toBeGreaterThan(widthOf(figures));
  }
  const row = rowOf(screen, "Cuidadosamente").element() as HTMLElement;
  const figureCells = [...row.querySelectorAll("td.text-right")];
  expect(figureCells.length).toBeGreaterThanOrEqual(4);
  for (const cell of figureCells) {
    expect(linesPainted(cell as HTMLElement)).toBe(1);
  }
});
