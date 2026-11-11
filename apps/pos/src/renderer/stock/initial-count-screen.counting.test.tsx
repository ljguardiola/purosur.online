import type { FindCountableProductOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { renderScreen } from "./test-support/initial-count-screen";
import {
  legendOf,
  renderLines,
  scan,
  withdrawing,
  YERBA_PRODUCT,
} from "./test-support/initial-count-screen";

const FOUND_YERBA: FindCountableProductOutcome = { kind: "found", product: YERBA_PRODUCT };
const YERBA_SUAVE = {
  product_id: "p9",
  name: "Yerba suave",
  sale_unit: "UNIT" as const,
  matches: [],
};

describe("InitialCountScreen counting a product in the side panel", () => {
  async function renderCounting(overrides: Parameters<typeof renderScreen>[0] = {}) {
    const rendered = await renderLines({
      findCountableProduct: vi.fn(async () => FOUND_YERBA),
      ...overrides,
    });
    await scan(rendered.field, "7790001");
    await expect
      .element(rendered.screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
      .toBeVisible();
    return rendered;
  }

  it("replaces the summary with the panel of the product, and brings it back when counting is cancelled with Esc", async () => {
    const { screen, field, recordInitialCountLine } = await renderCounting();
    await screen.router.navigate({ to: "/initial-count" });
    await expect.element(screen.getByText("Cargado hasta ahora")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("Cargado hasta ahora")).toBeVisible();
    await expect.element(field).toHaveFocus();
    expect(recordInitialCountLine).not.toHaveBeenCalled();
    expect(screen.router.state.location.pathname).toBe("/initial-count");
  });

  it("focuses the quantity when counting opens and the search field when it ends", async () => {
    const { screen, field } = await renderCounting();
    await expect.element(screen.getByRole("textbox", { name: "Cantidad contada" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(field).toHaveFocus();
  });

  it("shows the line keys and Tab Campo in the list's legend while counting, and only the line keys after", async () => {
    const { screen } = await renderCounting();
    expect(legendOf()).toEqual(["↑↓Líneas", "SuprQuitar", "TabCampo"]);

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("Cargado hasta ahora")).toBeVisible();
    expect(legendOf()).toEqual(["↑↓Líneas", "SuprQuitar"]);
  });

  it("moves between the fields of the panel with Tab alone, and records from Enter in the expiry", async () => {
    const { screen, recordInitialCountLine } = await renderCounting({
      recordInitialCountLine: vi.fn(async () => ({ kind: "unavailable" as const })),
    });
    await userEvent.keyboard("24");
    await userEvent.keyboard("{Tab}{Tab}");
    await expect
      .element(
        screen
          .getByRole("group", { name: /^Vencimiento/ })
          .getByRole("spinbutton")
          .first(),
      )
      .toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(recordInitialCountLine).toHaveBeenCalledWith("p2", 24_000, null);
  });

  it("leaves Supr and the arrows to the field of the panel: they edit it and move nothing in the list", async () => {
    const withdrawInitialCountLine = withdrawing();
    const { screen } = await renderCounting({ withdrawInitialCountLine });
    const quantity = screen.getByRole("textbox", { name: "Cantidad contada" });
    await userEvent.keyboard("1234");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{Delete}");
    await expect.element(quantity).toHaveValue("124");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.keyboard("{Tab}{ArrowDown}{ArrowUp}{Delete}");

    expect(withdrawInitialCountLine).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("row").nth(1)).toHaveAttribute("aria-current", "true");
  });

  it("acts on the lines again from the search field while counting", async () => {
    const withdrawInitialCountLine = withdrawing();
    const { screen, field } = await renderCounting({ withdrawInitialCountLine });
    await userEvent.click(field);

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(screen.getByRole("row").nth(2)).toHaveAttribute("aria-current", "true");
  });

  it("does not finish the count with F12 while counting", async () => {
    const { screen } = await renderCounting();
    await screen.router.navigate({ to: "/initial-count" });

    await userEvent.keyboard("{F12}");

    expect(screen.router.state.location.pathname).toBe("/initial-count");
    await expect
      .element(screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
      .toBeVisible();
  });

  it("does not swap the product being counted for one found by Enter in the search field", async () => {
    const { screen, field, findCountableProduct } = await renderCounting();
    await userEvent.click(field);
    await userEvent.keyboard("7790002{Enter}");

    expect(findCountableProduct).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
      .toBeVisible();
  });

  describe("with search results open while counting", () => {
    async function renderCountingWithResults() {
      const rendered = await renderCounting({
        searchCountableProducts: vi.fn(async () => ({
          kind: "results" as const,
          products: [YERBA_SUAVE],
          more: false,
        })),
      });
      await userEvent.click(rendered.field);
      await userEvent.keyboard("yer");
      await expect.element(rendered.screen.getByRole("listbox")).toBeVisible();
      return rendered;
    }

    it("does not swap the product being counted for a result chosen with Enter", async () => {
      const { screen } = await renderCountingWithResults();

      await userEvent.keyboard("{Enter}");

      await expect
        .element(screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("complementary", { name: "Yerba suave" }))
        .not.toBeInTheDocument();
    });

    it("does not swap the product being counted for a result that is clicked", async () => {
      const { screen } = await renderCountingWithResults();

      await userEvent.click(screen.getByRole("option", { name: /Yerba suave/ }));

      await expect
        .element(screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("complementary", { name: "Yerba suave" }))
        .not.toBeInTheDocument();
    });

    it("closes the results with Esc, still counting the product", async () => {
      const { screen } = await renderCountingWithResults();

      await userEvent.keyboard("{Escape}");

      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("complementary", { name: "Yerba mate 1 kg" }))
        .toBeVisible();
    });
  });

  it("does not open a second count for a code the reader reads while counting", async () => {
    const { screen, findCountableProduct, readBarcode } = await renderCounting();

    readBarcode("7790002");

    await expect.element(screen.getByText("No se agregó el producto escaneado")).toBeVisible();
    expect(findCountableProduct).toHaveBeenCalledTimes(1);
  });
});
