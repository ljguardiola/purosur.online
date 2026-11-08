import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { StockBalancePanel } from "./stock-balance-panel";
import { createServices } from "./test-support/stock-balances-screen";
import { almonds, tea } from "./test-support/stock-fixtures";

function renderPanel(
  product = almonds,
  {
    access = accessWith("stock_balances"),
    services = createServices(),
    onClose = () => {},
  }: {
    access?: BackofficeAccess;
    services?: ReturnType<typeof createServices>;
    onClose?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <StockBalancePanel
        product={product}
        access={access}
        services={services}
        onClose={onClose}
        onSessionEnded={() => {}}
      />
    </FieldSizeProvider>,
  );
}

test("shows the product's balance, cost, value and lots under its name", async () => {
  const screen = await renderPanel();

  const panel = screen.getByRole("complementary", { name: almonds.name });
  await expect.element(panel.getByText("12,150 kg")).toBeVisible();
  await expect.element(panel.getByText("$ 10.205,84 / kg")).toBeVisible();
  await expect.element(panel.getByText("$ 124.001,00")).toBeVisible();
  await expect
    .element(panel.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows no lots table for a product without lots", async () => {
  const screen = await renderPanel(tea);

  const panel = screen.getByRole("complementary", { name: tea.name });
  await expect.element(panel).toBeVisible();
  expect(panel.getByRole("table").query()).toBeNull();
});

test.each([
  ["counts", accessWith("stock_balances", "stock_counts"), [`Recuentos de ${almonds.name}`]],
  [
    "adjustments and losses",
    accessWith("stock_balances", "stock_movements"),
    [`Ajustes y pérdidas de ${almonds.name}`],
  ],
  [
    "counts, adjustments and losses",
    accessWith("stock_balances", "stock_counts", "stock_movements"),
    [`Recuentos de ${almonds.name}`, `Ajustes y pérdidas de ${almonds.name}`],
  ],
] as const)(
  "shows the product's %s to a person who may see them",
  async (_kinds, access, tables) => {
    const screen = await renderPanel(almonds, { access });

    for (const name of tables) {
      await expect.element(screen.getByRole("table", { name })).toBeVisible();
    }
  },
);

test("shows no movements and reads none for a person who can neither count nor move stock", async () => {
  const services = createServices();
  const screen = await renderPanel(almonds, { services });

  await expect
    .element(screen.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  expect(screen.getByText(/^Movimientos/).query()).toBeNull();
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("asks to close when its close button is pressed", async () => {
  const onClose = vi.fn();
  const screen = await renderPanel(almonds, { onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledOnce();
});
