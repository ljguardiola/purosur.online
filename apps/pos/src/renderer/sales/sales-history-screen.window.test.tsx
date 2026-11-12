import { describe, expect, it } from "vitest";
import {
  STORE_NOTEBOOK_WINDOW,
  scrollTheAreaHoldingItToItsEnd,
  showInStoreNotebookWindow,
  windowOverflow,
} from "../shell/test-support/register-window";
import { FISCAL_ROW, pageOf, renderScreen, table } from "./test-support/sales-history-screen";

const FIFTY_SALES = Array.from({ length: 50 }, (_, index) => ({
  ...FISCAL_ROW,
  sale_id: `sale-${index + 1}`,
  occurred_at: `2026-10-09T10:${String(index).padStart(2, "0")}:00.000-03:00`,
}));

describe("SalesHistoryScreen in the store notebook's window", () => {
  it("scrolls a page of sales longer than the window inside the list's own area, with the search, the menu and the detail panel in place", async () => {
    const { screen } = await renderScreen({ salesHistory: async () => pageOf(FIFTY_SALES) });
    await showInStoreNotebookWindow();
    const lastSale = table(screen).getByText("10:49", { exact: true });
    await expect.element(lastSale).toBeInTheDocument();

    scrollTheAreaHoldingItToItsEnd(lastSale.element());

    await expect.element(lastSale).toBeInViewport();
    await expect
      .element(screen.getByRole("searchbox", { name: "Escribí el número del comprobante" }))
      .toBeInViewport();
    await expect.element(screen.getByText("Todas", { exact: true })).toBeInViewport();
    expect(windowOverflow()).toEqual({ vertical: 0, horizontal: 0 });
    const menu = screen.getByRole("navigation", { name: "Menú de la caja" }).element();
    expect(menu.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
    const panel = screen.getByRole("complementary", { name: "Detalle de la venta" }).element();
    expect(panel.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
  });
});
