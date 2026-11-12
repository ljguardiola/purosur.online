import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { DETAIL, detailPanel, renderScreen } from "./test-support/sales-history-screen";

const AUTHORIZED = {
  kind: "authorized",
  point_of_sale: 3,
  number: 21,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

function voided(
  nextCopy: { kind: "original" } | { kind: "duplicate"; order_number: number },
): SaleDetail {
  return {
    ...DETAIL,
    state: "voided",
    voidability: { kind: "not_voidable", refusal: "not_completed" },
    reprint: { kind: "sale_voided" },
    credit_notes: [
      { credit_note_id: "cn-1", origin: "sale_void", standing: AUTHORIZED, next_copy: nextCopy },
    ],
  };
}

function showing(detail: SaleDetail) {
  return { saleHistoryDetail: async () => ({ kind: "found" as const, detail }) };
}

describe("SalesHistoryScreen credit note of a voided sale", () => {
  it("prints the original with F5, asking the core for that credit note only, and says it comes out as soon as the printer is ready", async () => {
    const { screen, printCreditNote } = await renderScreen(showing(voided({ kind: "original" })));
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");

    expect(printCreditNote).toHaveBeenCalledExactlyOnceWith("sale-1", "cn-1");
    await expect
      .element(screen.getByText("La nota de crédito sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  });

  it("reads the sale again after printing it", async () => {
    const { screen, saleHistoryDetail } = await renderScreen(showing(voided({ kind: "original" })));
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.keyboard("{F5}");

    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("says the credit note may have come out when a print of it was already tried", async () => {
    const { screen } = await renderScreen({
      ...showing(voided({ kind: "original" })),
      printCreditNote: async () => ({ kind: "already_attempted" }),
    });
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");

    await expect
      .element(screen.getByText("Puede que la nota de crédito haya salido"))
      .toBeVisible();
  });

  it("sends one request while the first is being answered", async () => {
    const answer = deferred<{ kind: "started"; copy: { kind: "original" } }>();
    const { screen, printCreditNote } = await renderScreen({
      ...showing(voided({ kind: "original" })),
      printCreditNote: () => answer.promise,
    });
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");
    await userEvent.keyboard("{F5}");
    answer.resolve({ kind: "started", copy: { kind: "original" } });

    await expect
      .element(screen.getByText("La nota de crédito sale en cuanto la impresora esté lista"))
      .toBeVisible();
    expect(printCreditNote).toHaveBeenCalledOnce();
  });

  it("says it was not printed when the core cannot be reached", async () => {
    const { screen } = await renderScreen({
      ...showing(voided({ kind: "original" })),
      printCreditNote: () => Promise.reject(new Error("gone")),
    });
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");

    await expect.element(screen.getByText("No se pudo imprimir la nota de crédito")).toBeVisible();
  });

  it("tells the route the session is no longer valid when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      ...showing(voided({ kind: "original" })),
      printCreditNote: async () => ({ kind: "not_signed_in" }),
    });
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("reprints an already printed one as a duplicate with a reason, naming only the credit note", async () => {
    const { screen, reprintCreditNote } = await renderScreen(
      showing(voided({ kind: "duplicate", order_number: 1 })),
    );
    await expect.element(detailPanel(screen).getByText("00003-00000021")).toBeVisible();

    await userEvent.keyboard("{F5}");
    const panel = screen.getByRole("complementary", { name: "Reimprimir" });
    await expect.element(panel.getByText("Nota de crédito C · 00003-00000021")).toBeVisible();
    await expect.element(panel.getByText("Factura C")).not.toBeInTheDocument();
    await userEvent.fill(
      panel.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(reprintCreditNote).toHaveBeenCalledExactlyOnceWith(
        "sale-1",
        "cn-1",
        "Otra copia",
        undefined,
      ),
    );
    await expect
      .element(
        screen.getByText(
          "La reimpresión de la nota de crédito sale en cuanto la impresora esté lista",
        ),
      )
      .toBeVisible();
  });

  it("tells how a credit note of the void it just made stands when the void is made", async () => {
    const { screen } = await renderScreen({
      voidSale: async () => ({
        kind: "voided",
        refunds: [],
        authorized_by: null,
        credit_note: { kind: "in_progress" },
      }),
    });
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

    await userEvent.keyboard("{Delete}");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(
        screen.getByText(
          "La nota de crédito quedó en trámite con ARCA. La imprimís desde el historial cuando esté.",
        ),
      )
      .toBeVisible();
  });
});
