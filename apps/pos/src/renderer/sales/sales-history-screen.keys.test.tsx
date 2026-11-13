import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleDetail } from "../shell/sale-receipt-text";
import {
  DETAIL,
  detailPanel,
  FISCAL_ROW,
  legendOf,
  pageOf,
  renderScreen,
  searchField,
  table,
} from "./test-support/sales-history-screen";

const CREDIT_NOTE = {
  credit_note_id: "cn-1",
  origin: "sale_void",
  standing: {
    kind: "authorized",
    point_of_sale: 3,
    number: 21,
    issued_on: "2026-10-09",
    authorization_code: "75123456789012",
    authorization_code_due_on: "2026-10-19",
  },
  next_copy: { kind: "duplicate", order_number: 1 },
} as const;

const VOIDED: SaleDetail = {
  ...DETAIL,
  state: "voided",
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  credit_notes: [CREDIT_NOTE],
};

const DEFERRED: SaleDetail = {
  ...DETAIL,
  state: "deferred",
  comprobante: { kind: "deferred_non_fiscal" },
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  next_copy: { kind: "original" },
};

function showing(detail: SaleDetail) {
  return { saleHistoryDetail: async () => ({ kind: "found" as const, detail }) };
}

describe("SalesHistoryScreen footer keys", () => {
  it("lists the arrows, F2, the reprint and the void of a completed sale the core says is voidable", async () => {
    const { screen } = await renderScreen();

    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "F5Reimprimir", "SuprAnular"]);
  });

  it("offers no void for a sale of another session", async () => {
    const { screen } = await renderScreen(
      showing({ ...DETAIL, voidability: { kind: "not_voidable", refusal: "session_closed" } }),
    );

    await expect.poll(() => legendOf(screen)).toEqual(["↑↓Ventas", "F2Buscar", "F5Reimprimir"]);
  });

  it("offers the credit note with F5 and the factura with F6 for a voided sale", async () => {
    const { screen } = await renderScreen(showing(VOIDED));

    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "F5Nota de crédito", "F6Factura"]);
  });

  it("offers no factura for a voided sale whose original was never attempted", async () => {
    const { screen } = await renderScreen(showing({ ...VOIDED, reprint: { kind: "sale_voided" } }));

    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "F5Nota de crédito"]);
  });

  it("offers printing the invoice with Enter for a deferred sale", async () => {
    const { screen } = await renderScreen(showing(DEFERRED));

    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "EnterImprimir factura"]);
  });

  it("offers printing the original with F5 for a sale never printed", async () => {
    const { screen } = await renderScreen(showing({ ...DETAIL, next_copy: { kind: "original" } }));

    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "F5Imprimir", "SuprAnular"]);
  });

  it("shows the keys of the selected sale as buttons in the panel", async () => {
    const { screen } = await renderScreen(showing(VOIDED));

    const panel = detailPanel(screen);
    await expect
      .element(panel.getByRole("button", { name: "Reimprimir nota de crédito" }).getByText("F5"))
      .toBeVisible();
    await expect
      .element(panel.getByRole("button", { name: "Reimprimir factura" }).getByText("F6"))
      .toBeVisible();
  });

  it("does not offer Supr while the search field is focused, so erasing text does not void", async () => {
    const { screen } = await renderScreen();
    await expect.poll(() => legendOf(screen)).toContain("SuprAnular");

    await userEvent.keyboard("{F2}");
    await userEvent.type(searchField(screen), "187");
    await userEvent.keyboard("{Delete}");

    await expect
      .element(screen.getByRole("complementary", { name: "Anular venta" }))
      .not.toBeInTheDocument();
    expect(legendOf(screen)).not.toContain("SuprAnular");
  });

  it("keeps the footer keys of the sale found by a search", async () => {
    const { screen } = await renderScreen({
      salesHistory: async () => pageOf([FISCAL_ROW]),
    });
    await userEvent.type(searchField(screen), "1248");

    await expect.element(table(screen).getByText("11:42", { exact: true })).toBeVisible();
    await expect.poll(() => legendOf(screen)).toContain("F5Reimprimir");
  });
});
