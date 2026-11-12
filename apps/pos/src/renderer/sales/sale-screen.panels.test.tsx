import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Overrides } from "./test-support/sale-screen";
import {
  legendOf,
  renderScreen,
  SALE_OF_FOUR_LINES,
  SALE_OF_YERBA,
} from "./test-support/sale-screen";

const LINE_PRICE = "Precio de la línea";
const SALE_DISCOUNT = "Descuento al total";
const EMPTY_SALE = "Vaciar venta";
const CANCEL_SALE = "Cancelar venta";
const FIELD_AND_OPTION_KEYS = ["TabCampo", "←→Opción"];
const PAID_SALE: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  refund_now_on_cancel: 100_000,
  refunds_on_cancel: [
    { payment_id: "p1", method: "CASH", amount: 100_000, state: "APPROVED", sent_by_cloud: false },
  ],
};

async function renderFourLines(overrides: Overrides = {}) {
  const rendered = await renderScreen({
    currentSale: async () => SALE_OF_FOUR_LINES,
    ...overrides,
  });
  await expect.element(rendered.screen.getByText("Pasas de uva")).toBeVisible();
  return rendered;
}

function panelNamed(screen: Awaited<ReturnType<typeof renderScreen>>["screen"], name: string) {
  return screen.getByRole("complementary", { name });
}

describe("SaleScreen opening the panels with F6, F7 and F8", () => {
  it("opens the price of the selected line on F6", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F6}");

    const panel = panelNamed(screen, LINE_PRICE);
    await expect.element(panel).toBeVisible();
    await expect.element(panel.getByText("Pasas de uva")).toBeVisible();
    await expect.element(panel.getByText("0,250 kg")).toBeVisible();
    await expect.element(panelNamed(screen, "Panel de cobro")).not.toBeInTheDocument();
  });

  it("opens the price of the line the arrows moved the selection to", async () => {
    const { screen } = await renderFourLines();
    await userEvent.keyboard("{ArrowUp}");

    await userEvent.keyboard("{F6}");

    await expect
      .element(panelNamed(screen, LINE_PRICE).getByText("Yerba mate orgánica 1 kg"))
      .toBeVisible();
  });

  it("opens the discount on the total on F7", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F7}");

    await expect.element(panelNamed(screen, SALE_DISCOUNT)).toBeVisible();
  });

  it("opens the confirmation to empty the sale on F8 when it has no payments", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F8}");

    await expect.element(panelNamed(screen, EMPTY_SALE)).toBeVisible();
  });

  it("opens the cancellation on F8 when the sale has payments", async () => {
    const { screen } = await renderScreen({ currentSale: async () => PAID_SALE });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await userEvent.keyboard("{F8}");

    await expect.element(panelNamed(screen, CANCEL_SALE)).toBeVisible();
  });

  it("opens each panel from its key while the search field holds text", async () => {
    const { screen, field } = await renderFourLines();
    await field.fill("7790");

    await userEvent.keyboard("{F7}");

    await expect.element(panelNamed(screen, SALE_DISCOUNT)).toBeVisible();
  });

  it("offers F6, F7 and F8 only under the conditions of the actions they open", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, sale_discount_refusal: "zero_total" }),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    expect(legendOf()).toEqual([
      "↑↓Líneas",
      "F2Buscar",
      "F6Precio",
      "F8Vaciar",
      "SuprQuitar",
      "+/−Cantidad",
    ]);
    await userEvent.keyboard("{F7}");
    await expect.element(panelNamed(screen, SALE_DISCOUNT)).not.toBeInTheDocument();
  });

  it("offers no F6, F7 or F8 before the sale is read", async () => {
    await renderScreen({ currentSale: () => new Promise(() => {}) });

    expect(legendOf()).toEqual([]);
  });
});

describe("SaleScreen closing a panel", () => {
  it.each([
    ["{F6}", LINE_PRICE],
    ["{F7}", SALE_DISCOUNT],
    ["{F8}", EMPTY_SALE],
  ])(
    "closes the panel opened by %s with Esc, bringing back the charge panel and the scan field's focus",
    async (key, name) => {
      const { screen, field } = await renderFourLines();
      await userEvent.keyboard(key);
      await expect.element(panelNamed(screen, name)).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(panelNamed(screen, name)).not.toBeInTheDocument();
      await expect.element(panelNamed(screen, "Panel de cobro")).toBeVisible();
      await expect.element(field).toHaveFocus();
    },
  );

  it("closes the panel from the Esc button at its top right", async () => {
    const { screen } = await renderFourLines();
    await userEvent.keyboard("{F7}");

    await screen.getByRole("button", { name: "Cerrar con Esc" }).click();

    await expect.element(panelNamed(screen, SALE_DISCOUNT)).not.toBeInTheDocument();
  });
});

describe("SaleScreen while a panel is open", () => {
  it.each([
    ["{F6}", LINE_PRICE],
    ["{F7}", SALE_DISCOUNT],
    ["{F8}", EMPTY_SALE],
  ])("leaves the keys of the screen off under the panel opened by %s", async (opening, name) => {
    const removeSaleLine = vi.fn();
    const { screen, field } = await renderFourLines({ removeSaleLine });
    await userEvent.keyboard(opening);
    await expect.element(panelNamed(screen, name)).toBeVisible();

    await userEvent.keyboard("{F2}{F3}{F6}{F7}{F8}{Delete}{ArrowUp}");

    await expect.element(panelNamed(screen, name)).toBeVisible();
    await expect.element(field).not.toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(panelNamed(screen, "Panel de cobro")).toBeVisible();
    await expect.element(screen.getByRole("row").last()).toHaveAttribute("aria-current", "true");
    expect(removeSaleLine).not.toHaveBeenCalled();
  });

  it("shows no F2 or F3 anywhere in the panel", async () => {
    const { screen } = await renderFourLines();
    await userEvent.keyboard("{F6}");

    const keys = [...panelNamed(screen, LINE_PRICE).element().querySelectorAll("kbd")].map(
      (key) => key.textContent,
    );

    expect(keys).not.toContain("F2");
    expect(keys).not.toContain("F3");
  });

  it("shows Tab Campo and ←→ Opción under the lines with the price panel, keeping the line selected", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F6}");

    await expect.poll(() => legendOf()).toEqual(FIELD_AND_OPTION_KEYS);
    await expect.element(screen.getByRole("row").last()).toHaveAttribute("aria-current", "true");
  });

  it("shows Tab Campo and ←→ Opción under the lines with the discount panel, with no line selected", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F7}");

    await expect.poll(() => legendOf()).toEqual(FIELD_AND_OPTION_KEYS);
    await expect
      .element(screen.getByRole("row").last())
      .not.toHaveAttribute("aria-current", "true");
  });

  it("shows no legend under the lines with the confirmation to empty the sale", async () => {
    const { screen } = await renderFourLines();

    await userEvent.keyboard("{F8}");

    await expect.element(panelNamed(screen, EMPTY_SALE)).toBeVisible();
    expect(legendOf()).toEqual([]);
  });

  it("selects the same line again when the panel closes", async () => {
    const { screen } = await renderFourLines();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{F7}");
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("row").nth(3)).toHaveAttribute("aria-current", "true");
  });

  it("keeps the line row actions off while a panel is open", async () => {
    const { screen } = await renderFourLines();
    await userEvent.keyboard("{F7}");

    await expect
      .element(screen.getByRole("button", { name: "Quitar Pasas de uva" }))
      .toBeDisabled();
  });
});
