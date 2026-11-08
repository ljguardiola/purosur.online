import type { ListedProduct } from "@purosur/contracts";
import { actionsColumn, Table, useTableModel } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { type ProductActions, productRowActions } from "./product-row-actions";
import { honey, retiredHoney } from "./test-support/products";

function createActions() {
  return {
    edit: vi.fn(),
    clone: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    openPanel: vi.fn(),
  } satisfies ProductActions;
}

function RowActionsTable({
  products,
  access,
  actions,
}: {
  products: ListedProduct[];
  access: BackofficeAccess;
  actions: ProductActions;
}) {
  const table = useTableModel({
    items: products,
    id: (product) => product.id,
    columns: [
      actionsColumn({ id: "actions", header: "Acciones", ...productRowActions(access, actions) }),
    ] as const,
  });
  return <Table aria-label="Productos" table={table} />;
}

async function renderRow(product: ListedProduct, access: BackofficeAccess) {
  await page.viewport(1280, 900);
  const actions = createActions();
  const screen = await render(
    <RowActionsTable products={[product]} access={access} actions={actions} />,
  );
  return { screen, actions };
}

test("keeps edit, clone and deactivate inline and puts the price and the stock in Más acciones", async () => {
  const { screen } = await renderRow(honey, ADMINISTRATOR_ACCESS);

  await expect
    .element(screen.getByRole("button", { name: `Editar el producto ${honey.name}` }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: `Clonar el producto ${honey.name}` }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: `Desactivar el producto ${honey.name}` }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await expect.element(page.getByRole("menuitem", { name: "Cambiar el precio" })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Ver stock y lotes" })).toBeVisible();
});

test("offers reactivate instead of deactivate for an inactive product", async () => {
  const { screen } = await renderRow(retiredHoney, ADMINISTRATOR_ACCESS);

  await expect
    .element(screen.getByRole("button", { name: `Reactivar el producto ${retiredHoney.name}` }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Desactivar/ }).query()).toBeNull();
});

test("offers no Más acciones menu to who sees neither prices nor stock balances", async () => {
  const { screen } = await renderRow(honey, accessWith("products_and_categories"));

  await expect
    .element(screen.getByRole("button", { name: `Editar el producto ${honey.name}` }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("lists only the stock in Más acciones for who sees stock balances but not prices", async () => {
  const { screen } = await renderRow(
    honey,
    accessWith("products_and_categories", "stock_balances"),
  );

  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));

  await expect.element(page.getByRole("menuitem", { name: "Ver stock y lotes" })).toBeVisible();
  expect(page.getByRole("menuitem").elements()).toHaveLength(1);
});

test("each action acts on its row's product and the menu opens the panel at the tab it names", async () => {
  const { screen, actions } = await renderRow(honey, ADMINISTRATOR_ACCESS);

  await userEvent.click(screen.getByRole("button", { name: `Editar el producto ${honey.name}` }));
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Cambiar el precio" }));
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Ver stock y lotes" }));

  expect(actions.edit).toHaveBeenCalledWith(honey);
  expect(actions.openPanel).toHaveBeenNthCalledWith(1, honey, "price");
  expect(actions.openPanel).toHaveBeenNthCalledWith(2, honey, "stock");
});

test("shows Cambiar el precio with the same pencil icon the price list uses for it", async () => {
  const { screen } = await renderRow(honey, ADMINISTRATOR_ACCESS);

  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));

  const changePrice = page.getByRole("menuitem", { name: "Cambiar el precio" });
  await expect.element(changePrice).toBeVisible();
  expect(changePrice.element().querySelector("svg.lucide-pencil")).not.toBeNull();
});

test("offers no Cambiar el precio for an inactive product, which has no price to change", async () => {
  const { screen } = await renderRow(retiredHoney, ADMINISTRATOR_ACCESS);

  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));

  await expect.element(page.getByRole("menuitem", { name: "Ver stock y lotes" })).toBeVisible();
  expect(page.getByRole("menuitem", { name: "Cambiar el precio" }).query()).toBeNull();
});

test("offers no Más acciones menu for an inactive product to who sees prices but not stock balances", async () => {
  const { screen } = await renderRow(
    retiredHoney,
    accessWith("products_and_categories", "prices_area"),
  );

  await expect
    .element(screen.getByRole("button", { name: `Reactivar el producto ${retiredHoney.name}` }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});
