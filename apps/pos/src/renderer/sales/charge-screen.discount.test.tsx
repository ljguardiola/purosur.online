import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { authorizationDialog } from "../shell/test-support/authorization-modal-steps";
import {
  chooseCash,
  renderScreen,
  SALE_OF_ONE_LINE,
  SALE_WITH_PART_PAID,
} from "./test-support/charge-screen";

const DISCOUNT_FIELD = "Otro";

async function openShortageOfChange() {
  await userEvent.keyboard("{F3}");
}

it("offers the discount in the cash charge of a sale without payments", async () => {
  const { screen } = await renderScreen();

  await chooseCash(screen);
  await openShortageOfChange();

  await expect.element(screen.getByRole("textbox", { name: DISCOUNT_FIELD })).toBeVisible();
});

it("does not offer the discount in the cash charge of a sale with an approved payment", async () => {
  const { screen } = await renderScreen({ currentSale: async () => SALE_WITH_PART_PAID });

  await chooseCash(screen);
  await openShortageOfChange();

  await expect
    .element(screen.getByRole("textbox", { name: DISCOUNT_FIELD }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Falta de cambio")).not.toBeInTheDocument();
});

it("does not offer the discount when the core refuses a discount on the total", async () => {
  const { screen } = await renderScreen({
    currentSale: async () => ({ ...SALE_OF_ONE_LINE, sale_discount_refusal: "zero_total" }),
  });

  await chooseCash(screen);
  await openShortageOfChange();

  await expect
    .element(screen.getByRole("textbox", { name: DISCOUNT_FIELD }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Falta de cambio")).not.toBeInTheDocument();
});

it("reads the cash charge with the discount typed and charges with it", async () => {
  const { screen, cashCharge, chargeSaleInCashWithChangeDiscount, chargeSaleInCash } =
    await renderScreen({
      cashCharge: async (_sale, tendered, discount) => ({
        kind: "covered",
        applied: 476_000 - (discount ?? 0),
        change: tendered - 476_000 + (discount ?? 0),
        cash_rounding: 0,
      }),
    });
  await chooseCash(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "5000");
  await openShortageOfChange();
  await userEvent.fill(screen.getByRole("textbox", { name: DISCOUNT_FIELD }), "10");

  await expect.poll(() => cashCharge).toHaveBeenCalledWith("sale-1", 500_000, 1_000);
  await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

  await expect
    .poll(() => chargeSaleInCashWithChangeDiscount)
    .toHaveBeenCalledWith("sale-1", 500_000, 1_000, undefined);
  expect(chargeSaleInCash).not.toHaveBeenCalled();
});

it("asks for the authorization in the modal, with the change shortage subtitle, when the sale requires it for a discount on the total", async () => {
  const { screen } = await renderScreen({
    currentSale: async () => ({ ...SALE_OF_ONE_LINE, sale_discount_authorization_required: true }),
  });
  await chooseCash(screen);

  await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "5000");
  await openShortageOfChange();
  await userEvent.fill(screen.getByRole("textbox", { name: DISCOUNT_FIELD }), "10");
  await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

  await expect
    .element(authorizationDialog().getByText("Falta de cambio", { exact: true }))
    .toBeVisible();
});

it("shows the total charged with the discount typed once the charge is completed", async () => {
  const { screen } = await renderScreen({
    cashCharge: async () => ({
      kind: "covered",
      applied: 475_000,
      change: 25_000,
      cash_rounding: 0,
    }),
    chargeSaleInCashWithChangeDiscount: async () => ({
      kind: "completed",
      sale_id: "sale-1",
      total: 475_000,
      tendered: 500_000,
      change: 25_000,
      cash_rounding: 0,
    }),
  });
  await chooseCash(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "5000");
  await openShortageOfChange();
  await userEvent.fill(screen.getByRole("textbox", { name: DISCOUNT_FIELD }), "10");
  await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

  const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
  await expect.element(panel.getByText("$ 4.750,00").first()).toBeVisible();
  await expect.element(panel.getByText("$ 4.760,00")).not.toBeInTheDocument();
});
