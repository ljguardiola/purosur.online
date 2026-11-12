import type { CurrentSaleAnswer } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  renderCombinedPayment,
  renderScreen,
  SALE_OF_ONE_LINE,
  SALE_WITH_PART_PAID,
  valueBeside,
} from "./test-support/charge-screen";

describe("ChargeScreen · Otros medios by keys", () => {
  it("opens the transfer with 1 and goes back to Otros medios with Esc", async () => {
    const { screen } = await renderScreen();

    await userEvent.keyboard("1");
    await expect.element(screen.getByRole("heading", { name: "Transferencia" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
  });

  it("opens the independent terminal with 2 and goes back to Otros medios with Esc", async () => {
    const { screen } = await renderScreen();

    await userEvent.keyboard("2");
    await expect
      .element(screen.getByRole("heading", { name: "Terminal independiente" }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
  });

  it("goes back to the sale with Esc from Otros medios opened from the sale", async () => {
    const { screen } = await renderScreen();

    await userEvent.keyboard("1{Escape}{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("goes back to the combined payment with Esc from Otros medios opened from it", async () => {
    const { screen } = await renderCombinedPayment();
    await expect.element(screen.getByText("FALTA")).toBeVisible();

    await userEvent.keyboard("{F1}");
    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("FALTA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Otros medios" }))
      .not.toBeInTheDocument();
    expect(screen.router.state.location.pathname).not.toBe("/session");
  });

  it("goes back to Otros medios and then to the combined payment from a transfer opened from it", async () => {
    const { screen } = await renderCombinedPayment();

    await userEvent.keyboard("{F1}");
    await userEvent.keyboard("1");
    await expect.element(screen.getByRole("heading", { name: "Transferencia" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("FALTA")).toBeVisible();
  });

  it("registers the transfer for the shown amount with Enter and completes the sale", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen();

    await userEvent.keyboard("1");
    await expect.element(screen.getByRole("textbox", { name: "IMPORTE" })).toHaveValue("4.760,00");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
  });

  it("registers a partial transfer with Enter and shows what is missing in the combined payment", async () => {
    const reads: CurrentSaleAnswer[] = [
      SALE_OF_ONE_LINE,
      { ...SALE_OF_ONE_LINE, paid: 200_000, pending: 276_000 },
    ];
    const { screen, chargeSaleByTransfer, nonCashCharge } = await renderScreen({
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      nonCashCharge: async () => ({ kind: "partial", applied: 200_000, pending: 276_000 }),
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await userEvent.keyboard("1");
    await userEvent.fill(screen.getByRole("textbox", { name: "IMPORTE" }), "2000,00");
    await expect.element(screen.getByText("QUEDA")).toBeVisible();
    expect(nonCashCharge).toHaveBeenLastCalledWith("sale-1", 200_000);
    await userEvent.keyboard("{Enter}");

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("FALTA")).toBeVisible();
    await expect.element(panel.getByText("$ 2.760,00")).toBeVisible();
    await expect.poll(() => valueBeside(screen, "Pagado")).toBe("– $ 2.000,00");
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 200_000);
  });

  it("registers the payment of the independent terminal for the shown amount with Enter", async () => {
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen();

    await userEvent.keyboard("2");
    await expect.element(screen.getByRole("textbox", { name: "IMPORTE" })).toHaveValue("4.760,00");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    expect(chargeSaleOnStandaloneTerminal).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
  });
});

describe("ChargeScreen · combined payment by keys", () => {
  it("opens the cash charge with F12", async () => {
    const { screen } = await renderCombinedPayment();

    await userEvent.keyboard("{F12}");

    await expect
      .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
      .toBeVisible();
  });

  it("opens the terminal by debit with F9", async () => {
    const { screen } = await renderCombinedPayment();

    await userEvent.keyboard("{F9}");

    await expect.element(screen.getByText(/Point · Débito/i)).toBeVisible();
  });

  it("opens the terminal by credit with F10", async () => {
    const { screen } = await renderCombinedPayment();

    await userEvent.keyboard("{F10}");

    await expect.element(screen.getByText(/Point · Crédito/i)).toBeVisible();
  });

  it("opens the QR with F11", async () => {
    const { screen } = await renderCombinedPayment();

    await userEvent.keyboard("{F11}");

    await expect.element(screen.getByRole("heading", { name: "QR", exact: true })).toBeVisible();
  });
});
