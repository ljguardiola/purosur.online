import type { CompleteReturnOutcome, FindSaleForReturnOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RenderedScreen } from "./test-support/return-screen";
import {
  alertText,
  chooseReturnLine,
  legendOf,
  openReturn,
  renderScreen,
  searchBox,
} from "./test-support/return-screen";
import { SALE } from "./test-support/sale-for-return";

const TWO_PAYMENTS = {
  findSaleForReturn: async (): Promise<FindSaleForReturnOutcome> => ({
    kind: "found",
    sale: SALE,
    ticket_source: "HISTORY",
    ticket_verification_required: false,
  }),
};

async function openRefunds(screen: RenderedScreen) {
  await openReturn(screen);
  await chooseReturnLine(screen, "Pasta de maní 380 g");
  await chooseReturnLine(screen, "Nibs de cacao");
  await userEvent.keyboard("{Enter}");
}

function refundsPanel(screen: RenderedScreen) {
  return screen.getByRole("complementary", { name: "Reintegro por medio de pago" });
}

const COMPLETED: CompleteReturnOutcome = {
  kind: "completed",
  return_id: "return-1",
  refunded_in_cash: 500_000,
  refunds: [
    {
      payment_id: "pay-cash",
      method: "CASH",
      amount: 500_000,
      state: "APPROVED",
      sent_by_cloud: false,
    },
    {
      payment_id: "pay-transfer",
      method: "TRANSFER",
      amount: 893_500,
      state: "PENDING",
      sent_by_cloud: false,
    },
  ],
  authorized_by: null,
};

describe("ReturnScreen refunding by payment method", () => {
  it("goes to the refund by method on Enter when the sale has more than one payment to refund", async () => {
    const { screen, completeReturn } = await renderScreen(TWO_PAYMENTS);

    await openRefunds(screen);

    await expect
      .element(screen.getByRole("table", { name: "Reintegro por medio de pago" }))
      .toBeVisible();
    expect(completeReturn).not.toHaveBeenCalled();
  });

  it("shows each method with when it is refunded and an amount, the first holding the whole total", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);

    await openRefunds(screen);

    const table = screen.getByRole("table", { name: "Reintegro por medio de pago" });
    for (const header of ["Medio", "Cuándo", "Reintegro"]) {
      await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect.element(table.getByText("Efectivo")).toBeVisible();
    await expect.element(table.getByText("En el acto")).toBeVisible();
    await expect.element(table.getByText("Transferencia")).toBeVisible();
    await expect.element(table.getByText("Reembolso pendiente")).toBeVisible();
    await expect.element(table.getByRole("textbox", { name: "Efectivo" })).toHaveValue("13.935,00");
    await expect.element(table.getByRole("textbox", { name: "Transferencia" })).toHaveValue("");
  });

  it("shows the total, the split lines and Esc in the panel, with the search inactive", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);

    await openRefunds(screen);

    const panel = refundsPanel(screen);
    await expect.element(panel.getByText("REINTEGRO", { exact: true })).toBeVisible();
    await expect.poll(() => panel.element().textContent).toMatch(/REINTEGRO\s*\$\s*13\.935,00/);
    await expect.element(panel.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(panel.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(panel.getByRole("button", { name: "Finalizar" })).toBeEnabled();
    await expect.element(searchBox(screen)).toBeDisabled();
  });

  it("lists the arrows Medio and Enter Finalizar, with no P key", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);

    await openRefunds(screen);

    expect(legendOf(screen)).toEqual(["↑↓Medio", "EnterFinalizar"]);
  });

  it("keeps the amount typed in each row when the down arrow selects the other method", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);
    await openRefunds(screen);
    const table = screen.getByRole("table", { name: "Reintegro por medio de pago" });
    await expect.element(table.getByRole("textbox", { name: "Efectivo" })).toHaveFocus();

    await userEvent.fill(table.getByRole("textbox", { name: "Efectivo" }), "5.000,00");
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(table.getByRole("textbox", { name: "Transferencia" })).toHaveFocus();
    await userEvent.fill(table.getByRole("textbox", { name: "Transferencia" }), "8.935,00");

    await expect.element(table.getByRole("textbox", { name: "Efectivo" })).toHaveValue("5.000,00");
    await expect
      .element(table.getByRole("textbox", { name: "Transferencia" }))
      .toHaveValue("8.935,00");
    await expect
      .element(refundsPanel(screen).getByText("Transferencia · reembolso pendiente"))
      .toBeVisible();
    await expect.element(refundsPanel(screen).getByText("$ 8.935,00")).toBeVisible();
  });

  it("completes with the typed amounts on Enter", async () => {
    const { screen, completeReturn } = await renderScreen({
      ...TWO_PAYMENTS,
      completeReturn: vi.fn(async () => COMPLETED),
    });
    await openRefunds(screen);
    const table = screen.getByRole("table", { name: "Reintegro por medio de pago" });
    await userEvent.fill(table.getByRole("textbox", { name: "Efectivo" }), "5.000,00");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.fill(table.getByRole("textbox", { name: "Transferencia" }), "8.935,00");

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(completeReturn).toHaveBeenCalledOnce());
    expect(completeReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketSource: "HISTORY",
        refunds: [
          { payment_id: "pay-cash", amount: 500_000 },
          { payment_id: "pay-transfer", amount: 893_500 },
        ],
      }),
    );
  });

  it("completes with the Finalizar button too", async () => {
    const { screen, completeReturn } = await renderScreen({
      ...TWO_PAYMENTS,
      completeReturn: vi.fn(async () => COMPLETED),
    });
    await openRefunds(screen);

    await userEvent.click(refundsPanel(screen).getByRole("button", { name: "Finalizar" }));

    await vi.waitFor(() => expect(completeReturn).toHaveBeenCalledOnce());
  });

  it("shows a red banner, keeping Finalizar enabled, when the amounts do not add up to the refund", async () => {
    const { screen } = await renderScreen({
      ...TWO_PAYMENTS,
      completeReturn: vi.fn(
        async (): Promise<CompleteReturnOutcome> => ({
          kind: "refund_refused",
          refusal: { kind: "total_mismatch", refundable_total: 1_393_500, imputed: 300_000 },
        }),
      ),
    });
    await openRefunds(screen);
    const table = screen.getByRole("table", { name: "Reintegro por medio de pago" });
    await userEvent.fill(table.getByRole("textbox", { name: "Efectivo" }), "3.000,00");

    await userEvent.keyboard("{Enter}");

    await expect
      .element(alertText(screen, "Lo que se reintegra por los pagos tiene que sumar $ 13.935,00."))
      .toBeVisible();
    await expect
      .element(refundsPanel(screen).getByRole("button", { name: "Finalizar" }))
      .toBeEnabled();
    await expect.element(table.getByRole("textbox", { name: "Efectivo" })).toHaveValue("3.000,00");
  });

  it("marks the amount the core could not read as invalid, saying so, without completing", async () => {
    const completeReturn = vi.fn(async (): Promise<CompleteReturnOutcome> => COMPLETED);
    const { screen } = await renderScreen({ ...TWO_PAYMENTS, completeReturn });
    await openRefunds(screen);
    const table = screen.getByRole("table", { name: "Reintegro por medio de pago" });
    await userEvent.fill(table.getByRole("textbox", { name: "Efectivo" }), "99999999999999999999");

    await userEvent.keyboard("{Enter}");

    await expect
      .element(table.getByRole("textbox", { name: "Efectivo" }))
      .toHaveAttribute("aria-invalid", "true");
    await expect
      .element(alertText(screen, "Ingresá un importe válido, por ejemplo 1.500,00."))
      .toBeVisible();
    expect(completeReturn).not.toHaveBeenCalled();
  });

  it("goes back to the lines, keeping them marked, on Esc", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);
    await openRefunds(screen);

    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("complementary", { name: "Resumen de la devolución" }))
      .toBeVisible();
    await expect.element(screen.getByRole("table", { name: "Líneas de la venta" })).toBeVisible();
    await expect.element(searchBox(screen)).toBeEnabled();
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderScreen(TWO_PAYMENTS);
    await openRefunds(screen);

    await expectNoAccessibilityViolations(document.body);
  });
});
