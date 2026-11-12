import type { CashChargeAmounts, CashChargeAnswer } from "@purosur/contracts";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { authorizationDialog } from "../shell/test-support/authorization-modal-steps";
import type { PanelOptions } from "./test-support/cash-charge-panel";
import { amountsOf, renderCashChargePanel, valueBeside } from "./test-support/cash-charge-panel";

const SALE = { total: 2_519_250, paid: 0, pending: 2_519_250 };

function amountsFor(discount: number | undefined, quickAmounts: number[]): CashChargeAmounts {
  return discount === undefined
    ? {
        kind: "amounts",
        amount_due: 2_519_250,
        amount_to_charge: 2_510_000,
        cash_rounding: 9_250,
        quick_amounts: quickAmounts,
        change_discount_option: 10_000,
      }
    : amountsOf(2_500_000, { cash_rounding: 9_250 });
}

async function coverTheCharge(tendered: number, discount?: number): Promise<CashChargeAnswer> {
  const applied = discount === undefined ? 2_510_000 : 2_500_000;
  return { kind: "covered", applied, change: tendered - applied, cash_rounding: 9_250 };
}

function renderBoardPanel(
  quickAmounts = [2_510_000, 2_600_000, 3_000_000, 4_000_000],
  options: PanelOptions = {},
) {
  return renderCashChargePanel({
    sale: SALE,
    readAmounts: async (discount) => amountsFor(discount, quickAmounts),
    readCharge: coverTheCharge,
    ...options,
  });
}

it("shows the quick amounts the core answers, each with its key, the exact one labelled", async () => {
  const { screen } = await renderBoardPanel();

  await expect.element(screen.getByRole("button", { name: "JUSTO $ 25.100,00" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "$ 26.000,00" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "$ 30.000,00" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "$ 40.000,00" })).toBeVisible();
  const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
  expect(keys).toEqual(expect.arrayContaining(["F6", "F7", "F8", "F9", "F3", "Enter", "Esc"]));
  expect(keys).not.toContain("F1");
  expect(keys).not.toContain("Tab");
});

it("shows only as many quick amounts, and keys, as the core answers", async () => {
  const { screen, field } = await renderBoardPanel([1_870_000, 1_900_000, 2_000_000]);
  await expect.element(screen.getByRole("button", { name: "$ 20.000,00" })).toBeVisible();

  const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
  expect(keys).toEqual(expect.arrayContaining(["F6", "F7", "F8"]));
  expect(keys).not.toContain("F9");
  await userEvent.keyboard("{F9}");
  await expect.element(field).toHaveValue("");
});

it("sets the received amount to a quick amount with its key, shows it selected and the change", async () => {
  const { screen, field } = await renderBoardPanel();
  await expect.element(screen.getByRole("button", { name: "$ 30.000,00" })).toBeVisible();

  await userEvent.keyboard("{F8}");

  await expect.element(field).toHaveValue("30.000,00");
  await expect
    .element(screen.getByRole("button", { name: "$ 30.000,00" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(screen.getByRole("button", { name: "$ 26.000,00" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect.element(screen.getByText("VUELTO")).toBeVisible();
  await expect.element(screen.getByText("$ 4.900,00", { exact: true })).toBeVisible();
});

it("sets the received amount to the quick amount that was clicked", async () => {
  const { screen, field } = await renderBoardPanel();

  await userEvent.click(screen.getByRole("button", { name: "JUSTO $ 25.100,00" }));

  await expect.element(field).toHaveValue("25.100,00");
  await expect.element(screen.getByText("$ 0,00", { exact: true })).toBeVisible();
});

it("takes the quick-amount keys while the received amount is being typed", async () => {
  const { field } = await renderBoardPanel();
  await userEvent.keyboard("5");
  await expect.element(field).toHaveValue("5");

  await userEvent.keyboard("{F7}");

  await expect.element(field).toHaveValue("26.000,00");
});

it("opens the shortage-of-change block with F3, with the suggested option selected and Otro, hiding the quick amounts", async () => {
  const { screen } = await renderBoardPanel();
  await expect.element(screen.getByRole("button", { name: "$ 26.000,00" })).toBeVisible();

  await userEvent.keyboard("{F3}");

  const block = screen.getByRole("group", { name: "FALTA DE CAMBIO" });
  await expect.element(block).toBeVisible();
  await expect
    .element(block.getByRole("button", { name: "– $ 100,00" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.element(block.getByRole("button", { name: "Quitar" })).toBeVisible();
  await expect.element(block.getByRole("textbox", { name: "Otro" })).toBeVisible();
  const keys = [...block.element().querySelectorAll("kbd")].map((key) => key.textContent);
  expect(keys).toEqual(["F3", "0"]);
  await expect.element(screen.getByRole("button", { name: "$ 26.000,00" })).not.toBeInTheDocument();
  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 25.000,00");
  expect(valueBeside(screen, "Total")).toBe("$ 25.192,50");
  expect(valueBeside(screen, "Falta de cambio")).toBe("– $ 100,00");
  expect(valueBeside(screen, "Redondeo")).toBe("– $ 92,50");
});

it("takes the shortage of change off with F3 again, with Quitar, and shows the quick amounts again", async () => {
  const { screen, field } = await renderBoardPanel();
  await userEvent.keyboard("{F3}");
  await expect.element(screen.getByRole("group", { name: "FALTA DE CAMBIO" })).toBeVisible();

  await userEvent.keyboard("{F3}");

  await expect
    .element(screen.getByRole("group", { name: "FALTA DE CAMBIO" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "$ 26.000,00" })).toBeVisible();
  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 25.100,00");
  await expect.element(field).toHaveFocus();

  await userEvent.click(screen.getByRole("button", { name: "Falta de cambio" }));
  await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

  await expect
    .element(screen.getByRole("group", { name: "FALTA DE CAMBIO" }))
    .not.toBeInTheDocument();
});

it("picks Otro with 0 and focuses its input, leaving the suggested option", async () => {
  const { screen, discountField } = await renderBoardPanel();
  await userEvent.keyboard("{F3}");

  await userEvent.keyboard("0");

  await expect.element(discountField).toHaveFocus();
  await expect.element(discountField).toHaveValue("");
  await expect
    .element(screen.getByRole("button", { name: "– $ 100,00" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 25.100,00");
});

it("takes a 0 typed in a focused text field as text, never as a key", async () => {
  const { field, discountField } = await renderBoardPanel();
  await userEvent.type(field, "10");
  await expect.element(field).toHaveValue("10");

  await userEvent.keyboard("{F3}");
  await userEvent.keyboard("0");
  await userEvent.keyboard("20");

  await expect.element(discountField).toHaveValue("20");
  await userEvent.keyboard("0");
  await expect.element(discountField).toHaveValue("200");
});

it("picks the suggested option again when it is pressed", async () => {
  const { screen, discountField } = await renderBoardPanel();
  await userEvent.keyboard("{F3}");
  await userEvent.keyboard("0");
  await userEvent.keyboard("50");
  await expect.poll(() => valueBeside(screen, "Falta de cambio")).toBe("– $ 50,00");

  await userEvent.click(screen.getByRole("button", { name: "– $ 100,00" }));

  await expect.poll(() => valueBeside(screen, "Falta de cambio")).toBe("– $ 100,00");
  await expect.element(discountField).toHaveValue("");
});

it("shows no suggested option when the core answers none, and only Otro", async () => {
  const { screen, discountField } = await renderBoardPanel(undefined, {
    readAmounts: async () => amountsOf(2_510_000, { quick_amounts: [2_510_000] }),
  });
  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 25.100,00");

  await userEvent.keyboard("{F3}");

  await expect.element(screen.getByRole("group", { name: "FALTA DE CAMBIO" })).toBeVisible();
  await expect.element(discountField).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^– \$/ })).not.toBeInTheDocument();
});

it("charges with Enter and goes back with Esc", async () => {
  const { field, complete, chargeSale, callbacks } = await renderBoardPanel();
  await userEvent.keyboard("{F8}");
  await expect.element(field).toHaveValue("30.000,00");
  await expect.element(complete).toBeEnabled();

  await userEvent.keyboard("{Enter}");

  await expect.poll(() => chargeSale.mock.calls).toEqual([[3_000_000]]);
  await userEvent.keyboard("{Escape}");
  expect(callbacks.onBack).toHaveBeenCalledOnce();
});

it("charges with the discount on Enter once the shortage-of-change block is open", async () => {
  const { complete, chargeSaleWithDiscount } = await renderBoardPanel();
  await userEvent.keyboard("{F8}");
  await userEvent.keyboard("{F3}");
  await expect.element(complete).toBeEnabled();

  await userEvent.keyboard("{Enter}");

  await expect
    .poll(() => chargeSaleWithDiscount.mock.calls)
    .toEqual([[3_000_000, 10_000, undefined]]);
});

it("presses the focused Esc button with Enter instead of charging", async () => {
  const { screen, complete, chargeSale, callbacks } = await renderBoardPanel();
  await userEvent.keyboard("{F8}");
  await expect.element(complete).toBeEnabled();
  screen.getByRole("button", { name: "Cerrar con Esc" }).element().focus();

  await userEvent.keyboard("{Enter}");

  await expect.poll(() => callbacks.onBack.mock.calls.length).toBe(1);
  expect(chargeSale).not.toHaveBeenCalled();
});

it("presses the focused Quitar with Enter instead of charging", async () => {
  const { screen, complete, chargeSale, chargeSaleWithDiscount } = await renderBoardPanel();
  await userEvent.keyboard("{F8}");
  await userEvent.keyboard("{F3}");
  await expect.element(complete).toBeEnabled();
  screen.getByRole("button", { name: "Quitar" }).element().focus();

  await userEvent.keyboard("{Enter}");

  await expect
    .element(screen.getByRole("group", { name: "FALTA DE CAMBIO" }))
    .not.toBeInTheDocument();
  expect(chargeSale).not.toHaveBeenCalled();
  expect(chargeSaleWithDiscount).not.toHaveBeenCalled();
});

it("leaves its keys to the authorization modal while it is open", async () => {
  const { field, discountField, complete, screen } = await renderBoardPanel(undefined, {
    authorizationRequired: true,
  });
  await userEvent.keyboard("{F8}");
  await userEvent.keyboard("{F3}");
  await userEvent.keyboard("0");
  await userEvent.keyboard("100");
  await expect.element(discountField).toHaveValue("100");
  await userEvent.click(complete);
  await expect.element(authorizationDialog()).toBeVisible();

  await userEvent.keyboard("{F7}");

  await expect.element(field).toHaveValue("30.000,00");
  await expect.element(screen.getByRole("button", { name: "Quitar" })).toBeVisible();
});
