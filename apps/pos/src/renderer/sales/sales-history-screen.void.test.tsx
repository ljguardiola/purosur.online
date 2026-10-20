import type { SalesHistoryOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseSale,
  DETAIL,
  FISCAL_ROW,
  pageOf,
  renderScreen,
  table,
} from "./test-support/sales-history-screen";

const DEFERRED_DETAIL = {
  ...DETAIL,
  comprobante: { kind: "deferred_non_fiscal" },
  state: "deferred",
} as const;

describe("SalesHistoryScreen voiding a sale", () => {
  it("opens the review of the sale chosen from its void button, with the refunds the core announced", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: DEFERRED_DETAIL }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });
    await expect.element(dialog.getByText("ANULAR VENTA DE LAS 11:42")).toBeVisible();
    await expect.element(dialog.getByText("Efectivo · $ 50.700,00")).toBeVisible();
  });

  it("closes the review from Volver without asking the core", async () => {
    const { screen, voidSale } = await renderScreen();
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    await expect
      .element(screen.getByRole("dialog", { name: "Revisá qué pasa al anular" }))
      .not.toBeInTheDocument();
    expect(voidSale).not.toHaveBeenCalled();
  });

  it("asks for another person's PIN when the person may not void", async () => {
    const { screen, voidSale } = await renderScreen({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: { ...DETAIL, void_authorization_required: true },
      }),
    });
    await chooseSale(screen, "11:42");
    await expect
      .element(screen.getByText("Sin permiso para anular, se pide el PIN de alguien que lo tenga."))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
    await userEvent.click(screen.getByRole("option", { name: "Grace" }));
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    expect(voidSale).toHaveBeenCalledExactlyOnceWith("sale-1", false, {
      user_id: "u2",
      pin: "1234",
    });
  });

  it("closes the review, says the sale was voided and reads the sales again once it is voided", async () => {
    let done = false;
    const { screen, voidSale, saleHistoryDetail, salesHistory } = await renderScreen({
      voidSale: async () => {
        done = true;
        return { kind: "voided", refunds: [], authorized_by: null, credit_note: null };
      },
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: done
          ? {
              ...DETAIL,
              state: "voided",
              voidability: { kind: "not_voidable", refusal: "not_completed" },
            }
          : DETAIL,
      }),
      salesHistory: async () => pageOf([{ ...FISCAL_ROW, state: done ? "voided" : "completed" }]),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    expect(voidSale).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined);
    await expect.element(screen.getByText("Venta anulada", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("dialog", { name: "Revisá qué pasa al anular" }))
      .not.toBeInTheDocument();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBe(2);
    await expect.poll(() => salesHistory.mock.calls.length).toBe(2);
    await expect.element(table(screen).getByText("Anulada")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Anular venta" }))
      .not.toBeInTheDocument();
  });

  it("reads the sale again, and keeps the review open with voiding locked, when the core refuses to void it", async () => {
    const { screen, saleHistoryDetail } = await renderScreen({
      voidSale: async () => ({ kind: "session_closed" }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    await expect
      .element(
        screen.getByRole("dialog").getByRole("button", { name: "Anular y emitir nota de crédito" }),
      )
      .toHaveAttribute("aria-disabled", "true");
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBe(2);
  });

  it("closes the review when the core cannot find the sale", async () => {
    const { screen } = await renderScreen({ voidSale: async () => ({ kind: "not_found" }) });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    await expect
      .element(screen.getByRole("dialog", { name: "Revisá qué pasa al anular" }))
      .not.toBeInTheDocument();
  });

  it("tells the route the session is no longer valid when voiding finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      voidSale: async () => ({ kind: "not_signed_in" }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("offers no void button for a sale that is already voided", async () => {
    const answer: SalesHistoryOutcome = pageOf([{ ...FISCAL_ROW, state: "voided" }]);
    const { screen } = await renderScreen({
      salesHistory: async () => answer,
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: {
          ...DETAIL,
          state: "voided",
          voidability: { kind: "not_voidable", refusal: "not_completed" },
        },
      }),
    });

    await chooseSale(screen, "11:42");

    await expect.element(screen.getByText("VENTA DE LAS 11:42")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
  });
});
