import type { PrintOriginalReceiptOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { SalesHistoryScreenProps } from "./sales-history-screen";
import { chooseSale, DETAIL, renderScreen } from "./test-support/sales-history-screen";

const NEVER_PRINTED_DETAIL = { ...DETAIL, next_copy: { kind: "original" } } as const;

const PRINT = "Imprimir original";

const CASHIER: SalesHistoryScreenProps["person"] = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["view_sales_history"],
};

describe("SalesHistoryScreen receipt of a sale never printed", () => {
  it("asks the core to print the original, with no reason and no authorization, and says it comes out as soon as the printer is ready", async () => {
    const { screen, printOriginalReceipt, reprintSaleReceipt } = await renderScreen({
      person: CASHIER,
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    expect(printOriginalReceipt).toHaveBeenCalledExactlyOnceWith("sale-1");
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
    await expect
      .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  });

  it("reads the sale again after printing it, so the next print is offered as a duplicate", async () => {
    const { screen, saleHistoryDetail } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
    });
    await chooseSale(screen, "11:42");
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("says the receipt may have come out, and reads the sale again, when a print of it was already tried", async () => {
    const { screen, saleHistoryDetail } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
      printOriginalReceipt: async () => ({ kind: "already_attempted" }),
    });
    await chooseSale(screen, "11:42");
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("Puede que el ticket haya salido")).toBeVisible();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it.each([
    [
      { kind: "busy" } as PrintOriginalReceiptOutcome,
      "Todavía puede salir una impresión de esta venta",
    ],
    [
      { kind: "printer_not_configured" } as PrintOriginalReceiptOutcome,
      "La impresora no está configurada",
    ],
    [
      { kind: "lacks_permission" } as PrintOriginalReceiptOutcome,
      "No tenés permiso para imprimir el ticket",
    ],
    [{ kind: "unavailable" } as PrintOriginalReceiptOutcome, "No se pudo imprimir el ticket"],
  ])("says why it was not printed: %j", async (outcome, title) => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
      printOriginalReceipt: async () => outcome,
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText(title)).toBeVisible();
  });

  it("says it was not printed when the core cannot be reached", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
      printOriginalReceipt: () => Promise.reject(new Error("the connection was replaced")),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
  });

  it.each([{ kind: "not_found" }, { kind: "sale_voided" }] as const)(
    "stops showing the sale when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderScreen({
        saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
        printOriginalReceipt: async () => outcome,
      });
      await chooseSale(screen, "11:42");

      await userEvent.click(screen.getByRole("button", { name: PRINT }));

      await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
    },
  );

  it("tells the route the session is no longer valid when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED_DETAIL }),
      printOriginalReceipt: async () => ({ kind: "not_signed_in" }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });
});
