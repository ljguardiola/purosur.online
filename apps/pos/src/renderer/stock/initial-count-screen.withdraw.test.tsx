import type { ReadInitialCountOutcome, WithdrawInitialCountLineOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  QUESO_LINE,
  readOf,
  renderScreen,
  withdrawing,
  YERBA_LINE,
} from "./test-support/initial-count-screen";

describe("InitialCountScreen withdrawing a counted line with Supr", () => {
  it("withdraws the line and reads the count again so it is gone", async () => {
    const readInitialCount = vi
      .fn<() => Promise<ReadInitialCountOutcome>>()
      .mockResolvedValueOnce(readOf([QUESO_LINE, YERBA_LINE]))
      .mockResolvedValue(readOf([YERBA_LINE]));
    const withdrawInitialCountLine = withdrawing({ kind: "withdrawn" });
    const { screen } = await renderScreen({ readInitialCount, withdrawInitialCountLine });

    await userEvent.keyboard("{Delete}");

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

      await userEvent.keyboard("{Delete}");

      await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("tells the line was not withdrawn when the core cannot answer, keeping it listed", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "unavailable" }),
    });

    await userEvent.keyboard("{Delete}");

    await expect.element(screen.getByText("No se pudo quitar la línea")).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "Queso cremoso" })).toBeVisible();
  });

  it("floats the notice at the bottom left of the lines, until it is closed", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "unavailable" }),
    });
    await userEvent.keyboard("{Delete}");
    const notice = screen.getByText("No se pudo quitar la línea");
    await expect.element(notice).toBeVisible();

    const box = notice.element().getBoundingClientRect();
    const lines = screen.getByRole("table", { name: "Líneas cargadas" }).element();
    const linesBox = lines.getBoundingClientRect();
    expect(lines.contains(notice.element())).toBe(false);
    expect(box.left - linesBox.left).toBeLessThan(40);
    expect(box.bottom).toBeLessThan(linesBox.bottom);
    expect(box.bottom).toBeGreaterThan((linesBox.top + linesBox.bottom) / 2);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    await expect.element(notice).not.toBeInTheDocument();
  });

  it("tells the person may no longer change the count", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_permitted" }),
    });

    await userEvent.keyboard("{Delete}");

    await expect
      .element(screen.getByText("Ya no tenés permiso para cargar el inventario inicial"))
      .toBeVisible();
  });

  it("retires the screen when the core says the count is no longer offered", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_offered" }),
    });

    await userEvent.keyboard("{Delete}");

    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
  });

  it("reports the end of the session when the core does not know who is signed in", async () => {
    const { onSessionInvalid } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      withdrawInitialCountLine: withdrawing({ kind: "not_signed_in" }),
    });

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});
