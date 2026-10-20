import type { PrintCreditNoteOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { chooseSale, DETAIL, renderScreen } from "./test-support/sales-history-screen";

const AUTHORIZED_CREDIT_NOTE = {
  kind: "authorized",
  point_of_sale: 3,
  number: 7,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

const VOIDED_DETAIL = {
  ...DETAIL,
  state: "voided",
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  reprint: { kind: "sale_voided" },
  credit_note: AUTHORIZED_CREDIT_NOTE,
} as const;

const PRINT = "Imprimir nota de crédito";

describe("SalesHistoryScreen credit note of a voided sale", () => {
  it("asks the core to print it and says it comes out as soon as the printer is ready", async () => {
    const { screen, printCreditNote } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    expect(printCreditNote).toHaveBeenCalledExactlyOnceWith("sale-1");
    await expect
      .element(screen.getByText("La nota de crédito sale en cuanto la impresora esté lista"))
      .toBeVisible();
  });

  it.each([
    [{ kind: "busy" } as PrintCreditNoteOutcome, "Todavía puede salir una impresión de esta venta"],
    [
      { kind: "printer_not_configured" } as PrintCreditNoteOutcome,
      "La impresora no está configurada",
    ],
    [
      { kind: "lacks_permission" } as PrintCreditNoteOutcome,
      "No tenés permiso para imprimir la nota de crédito",
    ],
    [{ kind: "unavailable" } as PrintCreditNoteOutcome, "No se pudo imprimir la nota de crédito"],
  ])("says why it was not printed: %j", async (outcome, title) => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
      printCreditNote: async () => outcome,
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText(title)).toBeVisible();
  });

  it("says it was not printed when the core cannot be reached", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
      printCreditNote: () => Promise.reject(new Error("the connection was replaced")),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("No se pudo imprimir la nota de crédito")).toBeVisible();
  });

  it("stops showing the sale when the core cannot find it", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
      printCreditNote: async () => ({ kind: "not_found" }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
  });

  it("tells the route the session is no longer valid when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
      printCreditNote: async () => ({ kind: "not_signed_in" }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("reviews the void with the invoice the core says its credit note corrects", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: {
          ...DETAIL,
          voidability: {
            kind: "voidable",
            refunds: [],
            credit_note_corrects: { point_of_sale: 31, number: 8 },
          },
        },
      }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await expect
      .element(screen.getByRole("dialog").getByText("PV 00031 · Nº 00000008"))
      .toBeVisible();
  });

  it("tells how the credit note of the void it just made stands when it is not printed", async () => {
    const { screen } = await renderScreen({
      voidSale: async () => ({
        kind: "voided",
        refunds: [],
        authorized_by: null,
        credit_note: { kind: "in_progress" },
      }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Anular y emitir nota de crédito" }),
    );

    await expect.element(screen.getByText("Venta anulada", { exact: true })).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La nota de crédito quedó en trámite con ARCA. La imprimís desde el historial cuando esté.",
        ),
      )
      .toBeVisible();
  });
});
