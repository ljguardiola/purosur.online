import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";
import { createServices, loaded } from "./test-support/purchases-list-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

const PANEL = "Compra a Distribuidora Andina";

test("asks to open the purchase's panel when its row is pressed", async () => {
  const onOpenPurchaseChange = vi.fn();
  const screen = await loaded(createServices(), { onOpenPurchaseChange });

  await userEvent.click(screen.getByRole("cell", { name: "Distribuidora Andina" }));

  expect(onOpenPurchaseChange).toHaveBeenCalledWith(compraDeMiel.id);
});

test("opens the panel with the lines, lots and linked freights while the list stays visible", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(screen.getByRole("cell", { name: "Distribuidora Andina" }));

  const panel = screen.getByRole("complementary", { name: PANEL });
  await expect.element(panel.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(panel.getByText("Compra 14/09/2026")).toBeVisible();
  await expect.element(panel.getByText("Flete de la miel")).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Compras" })).toBeVisible();
  await expect.element(screen.getByText("Granos del Valle")).toBeVisible();
});

test("highlights the row of the purchase whose panel is open", async () => {
  const screen = await loaded(createServices(), { openPurchase: compraDeMiel.id });

  const rows = screen.getByRole("table", { name: "Compras" }).getByRole("row");
  await expect
    .element(rows.filter({ hasText: "Distribuidora Andina" }))
    .toHaveAttribute("aria-current", "true");
  expect(rows.filter({ hasText: "Granos del Valle" }).element()).not.toHaveAttribute(
    "aria-current",
  );
});

test("shows the panel of the purchase named at the start", async () => {
  const screen = await loaded(createServices(), { openPurchase: compraDeAvena.id });

  await expect
    .element(screen.getByRole("complementary", { name: "Compra a Granos del Valle" }))
    .toBeVisible();
});

test("does not open the panel when a row action is pressed", async () => {
  const onOpenPurchaseChange = vi.fn();
  const screen = await loaded(createServices(), { onOpenPurchaseChange });

  await userEvent.click(
    screen.getByRole("button", { name: "Ver los cambios de la compra de Distribuidora Andina" }),
  );

  expect(onOpenPurchaseChange).not.toHaveBeenCalled();
});

test("asks to close the panel when its close button is pressed", async () => {
  const onOpenPurchaseChange = vi.fn();
  const screen = await loaded(createServices(), {
    openPurchase: compraDeMiel.id,
    onOpenPurchaseChange,
  });

  await userEvent.click(screen.getByRole("complementary").getByRole("button", { name: "Cerrar" }));

  expect(onOpenPurchaseChange).toHaveBeenLastCalledWith(undefined);
  expect(screen.getByRole("complementary").query()).toBeNull();
});
