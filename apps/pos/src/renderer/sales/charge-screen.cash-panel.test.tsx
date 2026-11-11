import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseCash,
  renderScreen,
  SALE_OF_TWO_LINES,
  SALE_WITH_PART_PAID,
} from "./test-support/charge-screen";

it("shows the sale's lines locked on the left beside the cash charge on the right", async () => {
  const { screen } = await renderScreen({ currentSale: async () => SALE_OF_TWO_LINES });

  await chooseCash(screen);

  const lines = screen.getByRole("table", { name: "Líneas de la venta" });
  await expect.element(lines.getByText("Yerba mate 1 kg")).toBeVisible();
  await expect.element(lines.getByText("Alfajor triple")).toBeVisible();
  await expect.element(lines.getByRole("img", { name: "Líneas bloqueadas" })).toBeVisible();
  await expect
    .element(lines.getByRole("button", { name: "Quitar Yerba mate 1 kg" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
    .toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "Efectivo" })).not.toBeInTheDocument();
});

it("shows no key legend under the locked lines", async () => {
  const { screen } = await renderScreen();

  await chooseCash(screen);

  const lines = screen.getByRole("table", { name: "Líneas de la venta" });
  await expect.element(lines).toBeVisible();
  expect(lines.element().closest("div")?.parentElement?.querySelector("kbd")).toBeNull();
});

it("asks the core for the amounts of the sale being charged and shows them", async () => {
  const { screen, cashChargeAmounts } = await renderScreen({
    cashChargeAmounts: async () => ({
      kind: "amounts",
      amount_to_charge: 470_000,
      cash_rounding: 6_000,
      quick_amounts: [470_000, 500_000],
      change_discount_option: null,
    }),
  });

  await chooseCash(screen);

  await expect.element(screen.getByRole("button", { name: "JUSTO $ 4.700,00" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "$ 5.000,00" })).toBeVisible();
  expect(cashChargeAmounts).toHaveBeenCalledWith("sale-1");
});

it("sets what was received with a quick-amount key and charges it with Enter", async () => {
  const { screen, chargeSaleInCash } = await renderScreen();
  await chooseCash(screen);
  await expect.element(screen.getByRole("button", { name: "$ 5.000,00" })).toBeVisible();

  await userEvent.keyboard("{F7}");
  await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => chargeSaleInCash.mock.calls).toEqual([["sale-1", 500_000]]);
  await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
});

it("goes back to the sale with Esc", async () => {
  const { screen } = await renderScreen();
  await chooseCash(screen);
  await expect
    .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
    .toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
});

it("keeps the sale's lines locked, and offers no shortage of change, for a sale with an approved payment", async () => {
  const { screen } = await renderScreen({ currentSale: async () => SALE_WITH_PART_PAID });

  await chooseCash(screen);

  await expect
    .element(
      screen.getByRole("table", { name: "Líneas de la venta" }).getByRole("img", {
        name: "Líneas bloqueadas",
      }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Falta de cambio")).not.toBeInTheDocument();
});

it("shows the sale screen's search field above the locked lines, inert", async () => {
  const { screen, chargeSaleInCash } = await renderScreen();
  await chooseCash(screen);

  const search = screen.getByRole("textbox", { name: "Producto" });
  await expect.element(search).toBeVisible();
  await expect.element(search).toHaveAttribute("placeholder", "Escaneá o escribí el nombre");
  await expect.element(search).toBeDisabled();
  await userEvent.keyboard("7790001{Enter}");
  await userEvent.type(search, "yerba", { skipClick: true });

  await expect.element(search).toHaveValue("");
  await expect
    .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
    .toBeVisible();
  expect(chargeSaleInCash).not.toHaveBeenCalled();
});
