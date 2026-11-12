import type { ReadInitialCountOutcome, WithdrawInitialCountLineOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  ALMENDRAS_LINE,
  FOUR_LINES,
  legendOf,
  QUESO_LINE,
  readOf,
  renderLines,
  renderScreen,
  withdrawing,
  YERBA_LINE,
  YERBA_PRODUCT,
} from "./test-support/initial-count-screen";

describe("InitialCountScreen moving through the lines by keyboard", () => {
  it("moves the selection with the arrows, staying on the first and the last line at the ends", async () => {
    const { screen } = await renderLines();
    const rows = screen.getByRole("row");

    await userEvent.keyboard("{ArrowUp}");
    await expect.element(rows.nth(1)).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(rows.nth(3)).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await expect.element(rows.nth(4)).toHaveAttribute("aria-current", "true");
    await expect.element(rows.nth(3)).not.toHaveAttribute("aria-current");
  });

  it("keeps the focus in the search field while the selection moves", async () => {
    const { field } = await renderLines();

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(field).toHaveFocus();
  });

  it("selects the line that is clicked", async () => {
    const { screen } = await renderLines();

    await userEvent.click(screen.getByRole("cell", { name: "Yerba mate 1 kg" }));

    await expect.element(screen.getByRole("row").nth(3)).toHaveAttribute("aria-current", "true");
  });

  it("lets the arrows move the results instead of the lines while the results are open", async () => {
    const { screen, field } = await renderLines({
      searchCountableProducts: vi.fn(async () => ({
        kind: "results" as const,
        products: [
          { ...YERBA_PRODUCT, matches: [] },
          { product_id: "p9", name: "Yerba suave", sale_unit: "UNIT" as const, matches: [] },
        ],
        more: false,
      })),
    });
    await field.fill("yer");
    await expect.element(screen.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{ArrowDown}");

    await expect
      .element(screen.getByRole("option").nth(1))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(screen.getByRole("row").nth(1)).toHaveAttribute("aria-current", "true");
  });

  it("withdraws the selected line on Supr, without asking for any authorization", async () => {
    const withdrawInitialCountLine = withdrawing();
    const { screen } = await renderLines({ withdrawInitialCountLine });
    await userEvent.keyboard("{ArrowDown}");

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => expect(withdrawInitialCountLine.mock.calls).toEqual([["m4"]]));
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("withdraws the selected line on Supr while the search field holds text, leaving the text", async () => {
    const withdrawInitialCountLine = withdrawing();
    const { field } = await renderLines({ withdrawInitialCountLine });
    await field.fill("7790");

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => expect(withdrawInitialCountLine.mock.calls).toEqual([["m3"]]));
    await expect.element(field).toHaveValue("7790");
  });

  it("leaves the selection on the line that followed the one withdrawn, and on the one before it when it was the last", async () => {
    const readInitialCount = vi
      .fn<() => Promise<ReadInitialCountOutcome>>()
      .mockResolvedValueOnce(readOf(FOUR_LINES))
      .mockResolvedValueOnce(readOf([ALMENDRAS_LINE, YERBA_LINE, QUESO_LINE]))
      .mockResolvedValue(readOf([ALMENDRAS_LINE, YERBA_LINE]));
    const { screen } = await renderLines({
      readInitialCount,
      withdrawInitialCountLine: withdrawing(),
    });
    const rows = screen.getByRole("row");
    await userEvent.keyboard("{ArrowDown}");

    await userEvent.keyboard("{Delete}");
    await expect.element(rows).toHaveLength(4);
    await expect.element(rows.nth(2)).toHaveAttribute("aria-current", "true");
    await expect.poll(() => rows.nth(2).element().textContent).toMatch(/^Yerba mate 1 kg/);
    await userEvent.keyboard("{ArrowDown}{Delete}");

    await expect.element(rows).toHaveLength(3);
    await expect.element(rows.nth(2)).toHaveAttribute("aria-current", "true");
    await expect.poll(() => rows.nth(2).element().textContent).toMatch(/^Yerba mate 1 kg/);
  });

  it("does not withdraw a second line while the first is still being withdrawn", async () => {
    const withdrawInitialCountLine = vi.fn(
      () => new Promise<WithdrawInitialCountLineOutcome>(() => {}),
    );
    await renderLines({ withdrawInitialCountLine });

    await userEvent.keyboard("{Delete}{Delete}");

    expect(withdrawInitialCountLine).toHaveBeenCalledTimes(1);
  });

  it("offers neither the arrows nor Supr while there is no line, and does nothing on Supr", async () => {
    const withdrawInitialCountLine = withdrawing();
    const { screen } = await renderScreen({ withdrawInitialCountLine });
    await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();

    await userEvent.keyboard("{Delete}");

    expect(legendOf()).toEqual([]);
    expect(withdrawInitialCountLine).not.toHaveBeenCalled();
  });
});

describe("InitialCountScreen leaving by keyboard", () => {
  it("finishes the count with F12, going home", async () => {
    const { screen } = await renderLines();
    await screen.router.navigate({ to: "/initial-count" });

    await userEvent.keyboard("{F12}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("goes home with Esc, and from the Esc keycap of the panel", async () => {
    const { screen } = await renderLines();
    await screen.router.navigate({ to: "/initial-count" });
    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));
    await expect.poll(() => screen.router.state.location.pathname).toBe("/");

    await screen.router.navigate({ to: "/initial-count" });
    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("goes home with Enter when the count is no longer offered", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE], false)),
    });
    await screen.router.navigate({ to: "/initial-count" });
    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("goes home with Enter when the person has no permission", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => ({ kind: "not_permitted" as const })),
    });
    await screen.router.navigate({ to: "/initial-count" });
    await expect
      .element(screen.getByText("No tenés permiso para cargar el inventario inicial"))
      .toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });
});
