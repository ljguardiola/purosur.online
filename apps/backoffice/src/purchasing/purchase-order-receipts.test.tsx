import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PurchaseOrderReceipts } from "./purchase-order-receipts";
import { PARTIALLY_RECEIVED_ORDER, SENT_ORDER } from "./test-support/purchase-orders";
import { AVENA_PRODUCT_ID } from "./test-support/purchase-products";

type Order = typeof PARTIALLY_RECEIVED_ORDER;

function renderReceipts(
  order: Order,
  { canOpenPurchases = false, onOpenPurchases = () => {} } = {},
) {
  return render(
    <main>
      <PurchaseOrderReceipts
        order={order}
        canOpenPurchases={canOpenPurchases}
        onOpenPurchases={onOpenPurchases}
      />
    </main>,
  );
}

function withReceiptLines(
  order: Order,
  change: (line: Order["receipts"][number]["lines"][number]) => object,
): Order {
  return {
    ...order,
    receipts: order.receipts.map((receipt) => ({
      ...receipt,
      lines: receipt.lines.map((receiptLine) => ({ ...receiptLine, ...change(receiptLine) })),
    })),
  };
}

test("shows nothing for an order nothing was received of", async () => {
  const screen = await renderReceipts(SENT_ORDER);

  expect(screen.getByRole("heading", { name: "Diferencias de recepción" }).query()).toBeNull();
  expect(screen.getByRole("table").query()).toBeNull();
});

test("lists each receipt with its day and, per line, what was received, what was missing and the price difference", async () => {
  const screen = await renderReceipts(PARTIALLY_RECEIVED_ORDER);

  await expect
    .element(screen.getByRole("heading", { name: "Diferencias de recepción" }))
    .toBeVisible();
  const table = screen.getByRole("table", { name: "Recepción del 12/03/2026" });
  const miel = table.getByRole("row", { name: /Miel pura de abeja 1 kg/ });
  await expect.element(miel.getByRole("cell").nth(1)).toHaveTextContent("24 u");
  await expect.element(miel.getByRole("cell").nth(2)).toHaveTextContent("12 u");
  await expect.element(miel.getByRole("cell").nth(3)).toHaveTextContent("$ 50,00");
  const avena = table.getByRole("row", { name: /Avena arrollada/ });
  await expect.element(avena.getByRole("cell").nth(1)).toHaveTextContent("40 kg");
  await expect.element(avena.getByRole("cell").nth(3)).toHaveTextContent("—");
});

test("lists every receipt of the order, each in its own table", async () => {
  const [receipt] = PARTIALLY_RECEIVED_ORDER.receipts;
  if (!receipt) {
    throw new Error("the fixture has a receipt");
  }
  const screen = await renderReceipts({
    ...PARTIALLY_RECEIVED_ORDER,
    receipts: [
      receipt,
      {
        ...receipt,
        id: "90e00000-0000-4000-8000-0000000000d2",
        receivedAt: "2026-03-14T15:00:00.000Z",
      },
    ],
  });

  await expect
    .element(screen.getByRole("table", { name: "Recepción del 12/03/2026" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Recepción del 14/03/2026" }))
    .toBeVisible();
});

test("a negative price difference reads with its sign", async () => {
  const screen = await renderReceipts(
    withReceiptLines(PARTIALLY_RECEIVED_ORDER, () => ({ priceDifferenceCents: -2_500 })),
  );

  const table = screen.getByRole("table", { name: "Recepción del 12/03/2026" });
  await expect.element(table.getByText("− $ 25,00").first()).toBeVisible();
});

test("names a received line whose product is no longer on the order as a product of the order", async () => {
  const screen = await renderReceipts({
    ...PARTIALLY_RECEIVED_ORDER,
    lines: PARTIALLY_RECEIVED_ORDER.lines.filter((line) => line.product.id !== AVENA_PRODUCT_ID),
  });

  const table = screen.getByRole("table", { name: "Recepción del 12/03/2026" });
  await expect.element(table.getByRole("row", { name: /Producto del pedido/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Miel pura de abeja 1 kg/ })).toBeVisible();
});

test("offers Ver compras on each receipt when it may open the purchases, and opens them", async () => {
  const onOpenPurchases = vi.fn();
  const screen = await renderReceipts(PARTIALLY_RECEIVED_ORDER, {
    canOpenPurchases: true,
    onOpenPurchases,
  });

  await userEvent.click(screen.getByRole("button", { name: "Ver compras" }));

  expect(onOpenPurchases).toHaveBeenCalledTimes(1);
});

test("offers no Ver compras when it may not open the purchases", async () => {
  const screen = await renderReceipts(PARTIALLY_RECEIVED_ORDER);

  await expect
    .element(screen.getByRole("heading", { name: "Diferencias de recepción" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Ver compras" }).query()).toBeNull();
});

test("has no accessibility violations with its receipts listed", async () => {
  const screen = await renderReceipts(PARTIALLY_RECEIVED_ORDER, { canOpenPurchases: true });

  await expect
    .element(screen.getByRole("heading", { name: "Diferencias de recepción" }))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
