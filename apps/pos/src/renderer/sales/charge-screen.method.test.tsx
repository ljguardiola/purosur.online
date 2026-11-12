import { describe, expect, it } from "vitest";
import { renderScreen, saleRebuiltAgainstPaidOrder } from "./test-support/charge-screen";

describe("ChargeScreen · chosen method", () => {
  it("shows the other methods to choose from when no method was chosen", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the cash charge straight away when cash was chosen", async () => {
    const { screen } = await renderScreen({ method: "CASH" });

    await expect
      .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the QR charge when the QR was chosen", async () => {
    const { screen } = await renderScreen({ method: "QR" });

    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Crear orden" })).toBeVisible();
  });

  it.each([
    ["POINT_DEBIT", /Point · Débito/i],
    ["POINT_CREDIT", /Point · Crédito/i],
  ] as const)("opens the terminal charge for %s", async (method, title) => {
    const { screen } = await renderScreen({ method });

    await expect.element(screen.getByRole("dialog").getByText(title)).toBeVisible();
  });

  it("shows the combined payment, with the method's tile disabled, when the chosen method is not available", async () => {
    const { screen } = await renderScreen({
      method: "QR",
      paymentMethodAvailability: async () => ({
        qr: "offline",
        point: "offline",
        point_minimum: 1500,
        qr_minimum: 1500,
      }),
    });

    await expect.element(screen.getByText("FALTA")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "QR" }))
      .toHaveAttribute("aria-disabled", "true");
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the paid order to apply instead of opening the chosen method", async () => {
    const { screen } = await renderScreen({
      method: "QR",
      currentSale: async () => saleRebuiltAgainstPaidOrder({ method: "QR", amount: 500_000 }),
    });

    await expect
      .element(screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" }))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });
});
