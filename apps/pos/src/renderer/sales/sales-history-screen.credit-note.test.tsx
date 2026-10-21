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
  credit_note_next_copy: { kind: "original" },
} as const;

const PRINTED_DETAIL = {
  ...VOIDED_DETAIL,
  credit_note_next_copy: { kind: "duplicate", order_number: 1 },
} as const;

const PRINT = "Imprimir nota de crédito";
const REPRINT = "Reimprimir duplicado";

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

  it("asks for no reason before printing the original", async () => {
    const { screen, printCreditNote } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    expect(printCreditNote).toHaveBeenCalledOnce();
  });

  it("reads the sale again after printing it, so the next print is offered as a duplicate", async () => {
    const { screen, saleHistoryDetail } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
    });
    await chooseSale(screen, "11:42");
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("says the credit note was already printed, and reads the sale again, when another print got ahead", async () => {
    const { screen, saleHistoryDetail } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
      printCreditNote: async () => ({ kind: "already_attempted" }),
    });
    await chooseSale(screen, "11:42");
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("La nota de crédito ya se imprimió")).toBeVisible();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  describe("a credit note already printed", () => {
    it("is reprinted as a numbered duplicate after asking the reason, naming it as the credit note of the sale", async () => {
      const { screen, reprintCreditNote, printCreditNote } = await renderScreen({
        saleHistoryDetail: async () => ({ kind: "found", detail: PRINTED_DETAIL }),
      });
      await chooseSale(screen, "11:42");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByText("REIMPRIMIR NOTA DE CRÉDITO DE LA VENTA DE LAS 11:42"))
        .toBeVisible();
      await expect.element(screen.getByText("COPIA DUPLICADA Nº 1")).toBeVisible();
      await userEvent.fill(
        screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
        "El cliente la perdió",
      );
      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      expect(reprintCreditNote).toHaveBeenCalledExactlyOnceWith(
        "sale-1",
        "El cliente la perdió",
        undefined,
      );
      expect(printCreditNote).not.toHaveBeenCalled();
      await expect
        .element(
          screen.getByText(
            "La reimpresión de la nota de crédito sale en cuanto la impresora esté lista",
          ),
        )
        .toBeVisible();
    });

    it("closes the modal without printing from Cancelar", async () => {
      const { screen, reprintCreditNote } = await renderScreen({
        saleHistoryDetail: async () => ({ kind: "found", detail: PRINTED_DETAIL }),
      });
      await chooseSale(screen, "11:42");
      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      await expect
        .element(screen.getByText("REIMPRIMIR NOTA DE CRÉDITO DE LA VENTA DE LAS 11:42"))
        .not.toBeInTheDocument();
      expect(reprintCreditNote).not.toHaveBeenCalled();
    });

    it("stops showing the sale when the core cannot find it", async () => {
      const { screen } = await renderScreen({
        saleHistoryDetail: async () => ({ kind: "found", detail: PRINTED_DETAIL }),
        reprintCreditNote: async () => ({ kind: "not_found" }),
      });
      await chooseSale(screen, "11:42");
      await userEvent.click(screen.getByRole("button", { name: REPRINT }));
      await userEvent.fill(
        screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
        "Otra copia",
      );

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
    });
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

  it.each([{ kind: "not_found" }, { kind: "sale_voided" }] as const)(
    "stops showing the sale when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderScreen({
        saleHistoryDetail: async () => ({ kind: "found", detail: VOIDED_DETAIL }),
        printCreditNote: async () => outcome,
      });
      await chooseSale(screen, "11:42");

      await userEvent.click(screen.getByRole("button", { name: PRINT }));

      await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
    },
  );

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
