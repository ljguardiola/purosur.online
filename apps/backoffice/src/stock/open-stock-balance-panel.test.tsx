import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { OpenStockBalancePanel } from "./open-stock-balance-panel";
import { createServices } from "./test-support/stock-balances-screen";
import { almonds, honey, oats } from "./test-support/stock-fixtures";

function renderOpenPanel({
  openProduct,
  productsAreLoaded = true,
  onClose = () => {},
}: {
  openProduct: string | undefined;
  productsAreLoaded?: boolean;
  onClose?: () => void;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <OpenStockBalancePanel
        products={[almonds, honey]}
        productsAreLoaded={productsAreLoaded}
        openProduct={openProduct}
        access={accessWith("stock_balances")}
        services={createServices()}
        onClose={onClose}
        onSessionEnded={() => {}}
      />
    </FieldSizeProvider>,
  );
}

test("opens the panel of the product named", async () => {
  const screen = await renderOpenPanel({ openProduct: honey.id });

  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
});

test("shows no panel when no product is named", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openProduct: undefined, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("shows no panel for a product the loaded list does not hold, and asks to close it", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openProduct: oats.id, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test("waits for the list to load before asking to close a product it does not hold yet", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({
    openProduct: oats.id,
    productsAreLoaded: false,
    onClose,
  });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("opens the panel of a product the list holds even when it was named before loading", async () => {
  const screen = await renderOpenPanel({ openProduct: almonds.id, productsAreLoaded: false });

  await expect.element(screen.getByRole("complementary", { name: almonds.name })).toBeVisible();
});
