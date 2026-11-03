import { describe, expect, it } from "vitest";
import {
  overflowsItsOwnHeight,
  STORE_NOTEBOOK_WINDOW,
  showInStoreNotebookWindow,
  windowOverflow,
} from "../shell/test-support/register-window";
import {
  chooseSale,
  DETAIL,
  FISCAL_ROW,
  pageOf,
  renderScreen,
  table,
} from "./test-support/sales-history-screen";

const FIFTY_SALES = Array.from({ length: 50 }, (_, index) => ({
  ...FISCAL_ROW,
  sale_id: `sale-${index + 1}`,
  operation_number: index + 1,
}));

describe("SalesHistoryScreen in the store notebook's window", () => {
  it("scrolls a page of sales longer than the window inside the list's own area, with the menu and the detail panel filling the window's height", async () => {
    const { screen } = await renderScreen({ salesHistory: async () => pageOf(FIFTY_SALES) });
    await showInStoreNotebookWindow();

    await expect.element(table(screen).getByText("Operación 000050")).toBeInTheDocument();
    expect(windowOverflow()).toEqual({ vertical: 0, horizontal: 0 });
    expect(overflowsItsOwnHeight(screen.getByRole("main").element())).toBe(true);
    const menu = screen.getByRole("navigation", { name: "Menú de la caja" }).element();
    expect(menu.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
    const panel = screen.getByRole("complementary", { name: "Detalle de la venta" }).element();
    expect(panel.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
  });

  it("keeps a sale's detail longer than the window inside the panel, which keeps the window's height", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: {
          ...DETAIL,
          payments: Array.from({ length: 30 }, () => ({
            method: "CASH" as const,
            card_type: null,
            amount: 169_000,
          })),
        },
      }),
    });
    await showInStoreNotebookWindow();

    await chooseSale(screen, "11:42");

    const panel = screen.getByRole("complementary", { name: "Detalle de la venta" });
    await expect.element(panel.getByText("PAGOS")).toBeVisible();
    expect(windowOverflow()).toEqual({ vertical: 0, horizontal: 0 });
    expect(panel.element().getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
    await expect.element(panel.getByRole("button", { name: "Anular venta" })).toBeInViewport();
  });
});
