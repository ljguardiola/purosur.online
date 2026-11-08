import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
import { listed, renderScreen } from "./test-support/stock-balances-screen";
import { almonds, honey } from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const EVERYTHING: BackofficeAccess = {
  ...accessWith("stock_area", "stock_balances", "stock_counts", "stock_movements"),
  stockMovementKinds: ["loss", "adjustment"],
};

function withKinds(...kinds: BackofficeAccess["stockMovementKinds"][number][]): BackofficeAccess {
  return { ...accessWith("stock_area", "stock_balances"), stockMovementKinds: kinds };
}

function rowOf(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  return screen.getByRole("row").filter({ hasText: name });
}

async function openRowMenu(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await expect.element(screen.getByText(name)).toBeVisible();
  await userEvent.click(rowOf(screen, name).getByRole("button", { name: "Más acciones" }));
}

function menuItems() {
  return page
    .getByRole("menuitem")
    .elements()
    .map((item) => item.textContent);
}

test("offers Contar, Ajustar and Registrar pérdida in the row menu to a person who can do all three", async () => {
  const screen = await renderScreen(listed(), { access: EVERYTHING });

  await openRowMenu(screen, honey.name);

  expect(menuItems()).toEqual(["Contar", "Ajustar", "Registrar pérdida"]);
});

test.each([
  [accessWith("stock_area", "stock_balances", "stock_counts"), ["Contar"]],
  [withKinds("adjustment"), ["Ajustar"]],
  [withKinds("loss"), ["Registrar pérdida"]],
] as const)("offers only what the person's access allows", async (access, expected) => {
  const screen = await renderScreen(listed(), { access });

  await openRowMenu(screen, honey.name);

  expect(menuItems()).toEqual(expected);
});

test("offers no row menu to a person who can neither count nor move stock", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("Contar opens the count with the row's product already chosen", async () => {
  const screen = await renderScreen(listed(), { access: EVERYTHING });

  await openRowMenu(screen, honey.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Contar" }));

  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await expect.element(dialog.getByRole("combobox", { name: /Producto/ })).toHaveValue(honey.name);
});

test("Ajustar opens the adjustment form alone, with the row's product already chosen", async () => {
  const screen = await renderScreen(listed(), { access: EVERYTHING });

  await openRowMenu(screen, honey.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Ajustar" }));

  const dialog = screen.getByRole("dialog", { name: "Cargar ajuste" });
  await expect.element(dialog.getByRole("combobox", { name: /Producto/ })).toHaveValue(honey.name);
  expect(dialog.getByRole("radio", { name: "Pérdida" }).query()).toBeNull();
});

test("Registrar pérdida opens the loss form alone, with the row's product already chosen", async () => {
  const screen = await renderScreen(listed(), { access: EVERYTHING });

  await openRowMenu(screen, honey.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Registrar pérdida" }));

  const dialog = screen.getByRole("dialog", { name: "Cargar pérdida" });
  await expect.element(dialog.getByRole("combobox", { name: /Producto/ })).toHaveValue(honey.name);
  expect(dialog.getByRole("radio", { name: "Ajuste" }).query()).toBeNull();
});

test("a registered count closes the modal, reloads the balances and says the balance was corrected", async () => {
  const services = listed();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 24_000, delta: -1000, balance: 23_000, superseded: false },
  });
  const screen = await renderScreen(services, { access: EVERYTHING });
  await openRowMenu(screen, honey.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Contar" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await expect.element(dialog.getByRole("combobox", { name: /Producto/ })).toHaveValue(honey.name);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "23");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.element(screen.getByText("Saldo corregido")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchStockBalances).mock.calls.length).toBe(2);
});

test("a registered adjustment closes the modal, reloads the balances and says the balance changed", async () => {
  const services = listed();
  vi.mocked(services.recordAdjustment).mockResolvedValue({
    kind: "ok",
    value: { balance: 26_000, superseded: false },
  });
  const screen = await renderScreen(services, { access: EVERYTHING });
  await openRowMenu(screen, almonds.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Ajustar" }));
  const dialog = screen.getByRole("dialog", { name: "Cargar ajuste" });
  await expect
    .element(dialog.getByRole("combobox", { name: /Producto/ }))
    .toHaveValue(almonds.name);

  await userEvent.click(
    dialog
      .getByRole("radio", { name: "Error en una compra" })
      .element()
      .closest("label") as HTMLElement,
  );
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "2");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el ajuste" }));

  await expect.element(screen.getByText("Saldo actualizado")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.fetchStockBalances).mock.calls.length)
    .toBeGreaterThan(1);
});

test("cancelling a modal leaves the balances as they were", async () => {
  const services = listed();
  const screen = await renderScreen(services, { access: EVERYTHING });
  await openRowMenu(screen, honey.name);
  await userEvent.click(page.getByRole("menuitem", { name: "Contar" }));

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchStockBalances).toHaveBeenCalledOnce();
});
