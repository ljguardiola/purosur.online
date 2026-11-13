import type { SalesHistoryOutcome } from "@purosur/contracts";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SalesHistoryQuery } from "../platform/core-client";
import type { SaleDetail } from "../shell/sale-receipt-text";
import {
  DEFERRED_ROW,
  DETAIL,
  FISCAL_ROW,
  pageOf,
  renderScreen,
  searchField,
  table,
} from "./test-support/sales-history-screen";

const TAX_AUTHORITY_QR_URL = "https://www.arca.gob.ar/fe/qr/?p=";

function fiscalQr(voucherType: number, pointOfSale = 3, number = 1248): string {
  const payload = { ver: 1, ptoVta: pointOfSale, tipoCmp: voucherType, nroCmp: number };
  return `${TAX_AUTHORITY_QR_URL}${btoa(JSON.stringify(payload))}`;
}

const FACTURA_C_QR = fiscalQr(11);
const CREDIT_NOTE_QR = fiscalQr(13);
const DEFERRED_QR = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

const DEFERRED_DETAIL: SaleDetail = {
  ...DETAIL,
  sale_id: "sale-2",
  state: "deferred",
  comprobante: { kind: "deferred_non_fiscal" },
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  next_copy: { kind: "original" },
  short_code: "7KQ4M2P9",
};

async function readSettled(readBarcode: (code: string) => void, code: string) {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => readBarcode(code));
  } finally {
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

function answerScans(query: SalesHistoryQuery): Promise<SalesHistoryOutcome> {
  if (query.search?.kind !== "scanned") {
    return Promise.resolve(pageOf([FISCAL_ROW, DEFERRED_ROW]));
  }
  return Promise.resolve(pageOf(query.search.text === DEFERRED_QR ? [DEFERRED_ROW] : [FISCAL_ROW]));
}

describe("SalesHistoryScreen finding a sale by scanning its ticket", () => {
  it("invites to scan the ticket or type the number", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByPlaceholder("Escaneá el ticket o escribí el número"))
      .toBeVisible();
  });

  it("asks for the scanned text of an invoice's QR and lists only that sale", async () => {
    const { screen, salesHistory, readBarcode } = await renderScreen({ salesHistory: answerScans });
    await expect.element(table(screen).getByText("10:20")).toBeVisible();

    readBarcode(FACTURA_C_QR);

    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith({
        session: "open",
        page: 1,
        search: { kind: "scanned", text: FACTURA_C_QR },
      }),
    );
    await expect.element(table(screen).getByText("11:42")).toBeVisible();
    await expect.element(table(screen).getByText("10:20")).not.toBeInTheDocument();
  });

  it("shows the invoice scanned in the search field as its point of sale and number", async () => {
    const { screen, readBarcode } = await renderScreen({ salesHistory: answerScans });

    readBarcode(FACTURA_C_QR);

    await expect.element(searchField(screen)).toHaveValue("00003-00001248");
  });

  it("looks in every session when Todas is chosen, as typing does", async () => {
    const { salesHistory, readBarcode } = await renderScreen({ salesHistory: answerScans });
    await userEvent.keyboard("{F3}");

    readBarcode(FACTURA_C_QR);

    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith({
        session: "all",
        page: 1,
        search: { kind: "scanned", text: FACTURA_C_QR },
      }),
    );
  });

  it("replaces what was typed with the scanned ticket", async () => {
    const { screen, salesHistory, readBarcode } = await renderScreen({ salesHistory: answerScans });
    await userEvent.type(searchField(screen), "187");

    readBarcode(FACTURA_C_QR);

    await expect.element(searchField(screen)).toHaveValue("00003-00001248");
    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: { kind: "scanned", text: FACTURA_C_QR } }),
      ),
    );
  });

  it("goes back to searching what is typed once the field is edited after a scan", async () => {
    const { screen, salesHistory, readBarcode } = await renderScreen({ salesHistory: answerScans });
    readBarcode(FACTURA_C_QR);
    await expect.element(searchField(screen)).toHaveValue("00003-00001248");

    await userEvent.clear(searchField(screen));
    await userEvent.type(searchField(screen), "187");

    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith({
        session: "open",
        page: 1,
        search: { kind: "typed", pointOfSale: null, number: 187 },
      }),
    );
  });

  it("lists a deferred sale scanned from its ticket in every session and shows its query code in the field", async () => {
    const { screen, salesHistory, readBarcode } = await renderScreen({
      salesHistory: answerScans,
      saleHistoryDetail: async () => ({ kind: "found", detail: DEFERRED_DETAIL }),
    });

    readBarcode(DEFERRED_QR);

    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith({
        session: "all",
        page: 1,
        search: { kind: "scanned", text: DEFERRED_QR },
      }),
    );
    await expect.element(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
    await expect.element(table(screen).getByText("09/10 10:20")).toBeVisible();
    await expect.element(table(screen).getByText("09/10 11:42")).not.toBeInTheDocument();
    await expect.element(searchField(screen)).toHaveValue("7KQ4-M2P9");
  });

  it("prints the invoice of a scanned deferred sale on Enter", async () => {
    const { screen, readBarcode, printDeferredSaleInvoice } = await renderScreen({
      salesHistory: answerScans,
      saleHistoryDetail: async () => ({ kind: "found", detail: DEFERRED_DETAIL }),
    });
    readBarcode(DEFERRED_QR);
    await expect.element(table(screen).getByText("11:42")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Imprimir factura" })).toBeVisible();

    await userEvent.keyboard("{Enter}");

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-2");
  });

  it.each(["lacks_permission", "not_signed_in"] as const)(
    "ignores a ticket scanned while the history answers %s, without saying a product was not added",
    async (refusal) => {
      const { screen, salesHistory, readBarcode } = await renderScreen({
        salesHistory: async () => ({ kind: refusal }),
      });
      await expect.element(searchField(screen)).toBeDisabled();

      await readSettled(readBarcode, FACTURA_C_QR);

      expect(screen.getByText("No se agregó el producto escaneado").query()).toBeNull();
      expect(screen.getByText("Ese QR no es de un ticket").query()).toBeNull();
      await expect.element(searchField(screen)).toHaveValue("");
      expect(salesHistory).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["a credit note's QR", CREDIT_NOTE_QR],
    ["another kind of QR", "https://example.test/qr"],
    ["a product's barcode", "7790001234567"],
  ])("leaves the search as it was and warns when %s is scanned", async (_case, code) => {
    const { screen, salesHistory, readBarcode } = await renderScreen({ salesHistory: answerScans });
    await userEvent.type(searchField(screen), "187");
    await vi.waitFor(() =>
      expect(salesHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: { kind: "typed", pointOfSale: null, number: 187 } }),
      ),
    );
    const callsBefore = salesHistory.mock.calls.length;

    readBarcode(code);

    await expect.element(screen.getByText("Ese QR no es de un ticket")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Escaneá el QR de la factura C o del documento de una venta diferida, o escribí el número.",
        ),
      )
      .toBeVisible();
    await expect.element(searchField(screen)).toHaveValue("187");
    expect(salesHistory.mock.calls).toHaveLength(callsBefore);
  });
});
