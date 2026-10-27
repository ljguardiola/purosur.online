import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import {
  RowItemCell,
  RowLinkCell,
  RowPriceCell,
  RowStatusCell,
} from "./supplier-price-list-row-cells";
import { EXTRACTED_ROWS, LINKED_ROW } from "./test-support/supplier-price-lists";

const [priced, unpriced, bare] = EXTRACTED_ROWS as [
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
];

test("names the item with its code, presentation and page, leaving out what the list did not print", async () => {
  const full = await render(<RowItemCell row={priced} />);
  await expect.element(full.getByText("Cód. AL-25 · Bolsa 25 kg · página 2")).toBeVisible();

  const none = await render(<RowItemCell row={unpriced} />);
  expect(none.container.textContent).toBe("Pasas de uva sultanitas x 10 kg");
});

test("shows the price, with the price per sale unit under it for a linked item", async () => {
  const linked = await render(<RowPriceCell row={priced} />);
  await expect.element(linked.getByText("$ 254.500,00")).toBeVisible();
  await expect.element(linked.getByText("$ 10.180,00 / kg")).toBeVisible();

  const notLinked = await render(<RowPriceCell row={bare} />);
  expect(notLinked.container.textContent).toBe("$ 142.000,00");
});

test("says an item has no price", async () => {
  const screen = await render(<RowPriceCell row={unpriced} />);

  await expect.element(screen.getByText("Sin precio")).toBeVisible();
});

test("shows no price per sale unit for a linked item the cloud gave none for", async () => {
  const screen = await render(<RowPriceCell row={{ ...LINKED_ROW, pricePerSaleUnit: null }} />);

  expect(screen.container.textContent).toBe("$ 198.450,00");
});

test("shows the product and the packaging an item is linked to, or that it is not linked", async () => {
  const linked = await render(<RowLinkCell row={LINKED_ROW} />);
  await expect.element(linked.getByText("Castañas de cajú")).toBeVisible();
  await expect.element(linked.getByText("Caja de 11,34 kg")).toBeVisible();

  const notLinked = await render(<RowLinkCell row={bare} />);
  await expect.element(notLinked.getByText("Sin vincular")).toBeVisible();
});

test("says the item may no longer be bought by the packaging it is linked to", async () => {
  const link = LINKED_ROW.link as NonNullable<typeof LINKED_ROW.link>;
  const notBuyable = await render(
    <RowLinkCell
      row={{ ...LINKED_ROW, link: { ...link, packaging: { ...link.packaging, buyable: false } } }}
    />,
  );
  await expect.element(notBuyable.getByText("Ya no se compra en esta presentación")).toBeVisible();

  const buyable = await render(<RowLinkCell row={LINKED_ROW} />);
  expect(buyable.container.textContent).not.toContain("Ya no se compra");
});

test("shows the status, and the earlier price only when there is one", async () => {
  const changed = await render(<RowStatusCell row={priced} />);
  await expect.element(changed.getByText("Cambió el precio")).toBeVisible();
  await expect.element(changed.getByText("Antes $ 248.000,00")).toBeVisible();

  const fresh = await render(<RowStatusCell row={bare} />);
  await expect.element(fresh.getByText("Nuevo")).toBeVisible();
  expect(fresh.container.textContent).not.toContain("Antes");
});
