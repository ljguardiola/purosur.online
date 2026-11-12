import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { chooseCash, renderScreen } from "./test-support/charge-screen";

it("shows the rounded total once a cash charge with rounding is completed", async () => {
  const { screen } = await renderScreen({
    cashCharge: async () => ({
      kind: "covered",
      applied: 475_000,
      change: 25_000,
      cash_rounding: 1_000,
    }),
    chargeSaleInCash: async () => ({
      kind: "completed",
      sale_id: "sale-1",
      total: 475_000,
      tendered: 500_000,
      change: 25_000,
      cash_rounding: 1_000,
    }),
  });
  await chooseCash(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "5000");
  await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

  const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
  await expect.element(panel.getByText("$ 4.750,00").first()).toBeVisible();
  await expect.element(panel.getByText("$ 4.760,00")).not.toBeInTheDocument();
});
