import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { formatStockQuantity } from "../platform/stock-quantity";
import { render } from "../shell/test-support/render-with-router";
import { ProductStockSection } from "./product-stock-section";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { almonds, honey, stockBalanceList } from "./test-support/stock-fixtures";

function renderSection(
  fetchStockBalances: StockBalancesScreenServices["fetchStockBalances"],
  product: { id: string; name: string; saleUnit: "UNIT" | "KG" } = almonds,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <ProductStockSection
        productId={product.id}
        productName={product.name}
        saleUnit={product.saleUnit}
        onSessionEnded={onSessionEnded}
        services={{ fetchStockBalances }}
      />
    </FieldSizeProvider>,
  );
}

test("picks the product's own balance from the cloud's list and shows it with its lots", async () => {
  const fetchStockBalances = vi
    .fn<StockBalancesScreenServices["fetchStockBalances"]>()
    .mockResolvedValue({ kind: "ok", value: stockBalanceList([honey, almonds]) });

  const screen = await renderSection(fetchStockBalances);

  await expect.element(screen.getByText(formatStockQuantity(almonds.balance, "KG"))).toBeVisible();
  for (const lot of almonds.lots) {
    await expect.element(screen.getByText(lot.lotName)).toBeVisible();
  }
  expect(screen.getByText(honey.lots[0]?.lotName ?? "").query()).toBeNull();
});

test("says so when the cloud has no balance for the product", async () => {
  const fetchStockBalances = vi
    .fn<StockBalancesScreenServices["fetchStockBalances"]>()
    .mockResolvedValue({ kind: "ok", value: stockBalanceList([honey]) });

  const screen = await renderSection(fetchStockBalances);

  await expect.element(screen.getByText("Sin stock registrado")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El producto aparece acá cuando tenga una compra, una producción o un recuento.",
      ),
    )
    .toBeVisible();
});

test("ends the session when the cloud answers that it is over", async () => {
  const onSessionEnded = vi.fn();

  await renderSection(
    vi
      .fn<StockBalancesScreenServices["fetchStockBalances"]>()
      .mockResolvedValue({ kind: "unauthenticated" }),
    almonds,
    onSessionEnded,
  );

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledOnce());
});

test("lets the person retry a failed read", async () => {
  const fetchStockBalances = vi
    .fn<StockBalancesScreenServices["fetchStockBalances"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: stockBalanceList([almonds]) });
  const screen = await renderSection(fetchStockBalances);

  await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }));

  await expect.element(screen.getByText(formatStockQuantity(almonds.balance, "KG"))).toBeVisible();
});
