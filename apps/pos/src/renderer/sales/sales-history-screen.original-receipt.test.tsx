import type { PrintOriginalReceiptOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { DETAIL, detailPanel, renderScreen } from "./test-support/sales-history-screen";

const NEVER_PRINTED = { ...DETAIL, next_copy: { kind: "original" } } as const;

async function renderNeverPrinted(options: Parameters<typeof renderScreen>[0] = {}) {
  const rendered = await renderScreen({
    saleHistoryDetail: async () => ({ kind: "found", detail: NEVER_PRINTED }),
    ...options,
  });
  await expect
    .element(detailPanel(rendered.screen).getByRole("button", { name: "Imprimir original" }))
    .toBeVisible();
  return rendered;
}

describe("SalesHistoryScreen receipt of a sale never printed", () => {
  it("prints the original on F5, with no reason and no authorization, and says it comes out as soon as the printer is ready", async () => {
    const { screen, printOriginalReceipt, reprintSaleReceipt } = await renderNeverPrinted();

    await userEvent.keyboard("{F5}");

    expect(printOriginalReceipt).toHaveBeenCalledExactlyOnceWith("sale-1");
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
    await expect
      .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  });

  it("reads the sale again after printing it, so the next print is offered as a duplicate", async () => {
    const { saleHistoryDetail } = await renderNeverPrinted();
    const readsBefore = saleHistoryDetail.mock.calls.length;

    await userEvent.keyboard("{F5}");

    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("says the receipt may have come out when a print of it was already tried", async () => {
    const { screen } = await renderNeverPrinted({
      printOriginalReceipt: async () => ({ kind: "already_attempted" }),
    });

    await userEvent.keyboard("{F5}");

    await expect.element(screen.getByText("Puede que el ticket haya salido")).toBeVisible();
  });

  it("says why it was not printed", async () => {
    const { screen } = await renderNeverPrinted({
      printOriginalReceipt: async () => ({ kind: "printer_not_configured" }),
    });

    await userEvent.keyboard("{F5}");

    await expect.element(screen.getByText("La impresora no está configurada")).toBeVisible();
  });

  it("sends no second request while the first is being answered", async () => {
    const answer = deferred<PrintOriginalReceiptOutcome>();
    const { screen, printOriginalReceipt } = await renderNeverPrinted({
      printOriginalReceipt: () => answer.promise,
    });

    await userEvent.keyboard("{F5}");
    await userEvent.keyboard("{F5}");
    answer.resolve({ kind: "started", copy: { kind: "original" } });

    await expect
      .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
      .toBeVisible();
    expect(printOriginalReceipt).toHaveBeenCalledOnce();
  });

  it("says it was not printed when the core cannot be reached", async () => {
    const { screen } = await renderNeverPrinted({
      printOriginalReceipt: () => Promise.reject(new Error("gone")),
    });

    await userEvent.keyboard("{F5}");

    await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
  });

  it("tells the route the session is no longer valid when printing finds nobody signed in", async () => {
    const { onSessionInvalid } = await renderNeverPrinted({
      printOriginalReceipt: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.keyboard("{F5}");

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });
});
