import type { ReadInitialCountOutcome, WithdrawInitialCountLineOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { QUESO_LINE, readOf, renderScreen, YERBA_LINE } from "./test-support/initial-count-screen";

function withdrawing(outcome: WithdrawInitialCountLineOutcome) {
  return vi.fn(async () => outcome);
}

describe("InitialCountScreen withdrawing a counted line", () => {
  it("withdraws the line and reads the count again so it is gone", async () => {
    const readInitialCount = vi
      .fn<() => Promise<ReadInitialCountOutcome>>()
      .mockResolvedValueOnce(readOf([QUESO_LINE, YERBA_LINE]))
      .mockResolvedValue(readOf([YERBA_LINE]));
    const withdrawInitialCountLine = withdrawing({ kind: "withdrawn" });
    const { screen } = await renderScreen({ readInitialCount, withdrawInitialCountLine });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

    await expect
      .element(screen.getByRole("cell", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
    expect(withdrawInitialCountLine.mock.calls).toEqual([["m1"]]);
  });

  it.each<WithdrawInitialCountLineOutcome["kind"]>(["not_found", "already_withdrawn"])(
    "reads the count again without a notice when the line was already gone (%s)",
    async (kind) => {
      const readInitialCount = vi
        .fn<() => Promise<ReadInitialCountOutcome>>()
        .mockResolvedValueOnce(readOf([QUESO_LINE]))
        .mockResolvedValue(readOf([]));
      const { screen } = await renderScreen({
        readInitialCount,
        withdrawInitialCountLine: withdrawing({ kind } as WithdrawInitialCountLineOutcome),
      });

      await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

      await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("tells the line was not withdrawn when the core cannot answer, keeping it listed", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "unavailable" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

    await expect.element(screen.getByText("No se pudo quitar la línea")).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "Queso cremoso" })).toBeVisible();
  });

  it("tells the person may no longer change the count", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_permitted" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

    await expect
      .element(screen.getByText("Ya no tenés permiso para cargar el inventario inicial"))
      .toBeVisible();
  });

  it("retires the screen when the core says the count is no longer offered", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_offered" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
  });

  it("reports the end of the session when the core does not know who is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Queso cremoso" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});
