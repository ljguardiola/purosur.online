import type { ListedCashMovement } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CashMovementsTable } from "./cash-movements-table";

const ADA = { user_id: "u1", first_name: "Ada" };
const GRACE = { user_id: "u2", first_name: "Grace" };

function movement(overrides: Partial<ListedCashMovement> = {}): ListedCashMovement {
  return {
    id: "m1",
    type: "CASH_IN",
    amount: 500_000,
    reason: null,
    occurred_at: "2026-09-30T15:05:00.000Z",
    actor: ADA,
    authorized_by: null,
    ...overrides,
  };
}

async function renderTable(movements: ListedCashMovement[]) {
  await page.viewport(1280, 720);
  return render(<CashMovementsTable movements={movements} />);
}

function rowsOf(screen: Awaited<ReturnType<typeof renderTable>>) {
  return Array.from(screen.container.querySelectorAll("tbody tr")).map(
    (row) => row.textContent ?? "",
  );
}

describe("CashMovementsTable", () => {
  it.each<[CashMovementType, string | null, string, string, string]>([
    ["OPENING", null, "Apertura de sesión", "Fondo inicial", "+ $ 5.000,00"],
    [
      "CASH_IN",
      "Cambio para el cajón",
      "Ingreso de efectivo",
      "Cambio para el cajón",
      "+ $ 5.000,00",
    ],
    ["CASH_OUT", "Flete", "Gasto", "Flete", "− $ 5.000,00"],
    ["WITHDRAWAL", "Fin de turno", "Retiro a caja fuerte", "Fin de turno", "− $ 5.000,00"],
    ["SALE", null, "Venta", "Cobro en efectivo", "+ $ 5.000,00"],
    ["CHANGE", null, "Vuelto", "", "− $ 5.000,00"],
    ["REFUND", null, "Devolución en efectivo", "", "− $ 5.000,00"],
    ["CLOSING", null, "Cierre de sesión", "", "$ 5.000,00"],
  ])("presents a %s movement", async (type, reason, title, secondLine, amount) => {
    const screen = await renderTable([movement({ type, reason })]);

    const [row] = rowsOf(screen);
    expect(row).toBe(`12:05${title}${secondLine}Ada${amount}`);
  });

  it("names the person who authorized a movement under the one who recorded it", async () => {
    const screen = await renderTable([movement({ authorized_by: GRACE })]);

    const [row] = rowsOf(screen);
    expect(row).toContain("Adaautorizó Grace");
  });

  it("shows the time in Argentina time", async () => {
    const screen = await renderTable([movement({ occurred_at: "2026-10-01T02:30:00.000Z" })]);

    expect(rowsOf(screen)[0]).toMatch(/^23:30/);
  });

  it("lists the newest movement first", async () => {
    const screen = await renderTable([
      movement({ id: "a", occurred_at: "2026-09-30T12:00:00.000Z" }),
      movement({ id: "c", occurred_at: "2026-09-30T18:00:00.000Z" }),
      movement({ id: "b", occurred_at: "2026-09-30T15:00:00.000Z" }),
    ]);

    expect(rowsOf(screen).map((row) => row.slice(0, 5))).toEqual(["15:00", "12:00", "09:00"]);
  });

  it("lists the oldest movement first once the time column is sorted the other way", async () => {
    const screen = await renderTable([
      movement({ id: "a", occurred_at: "2026-09-30T12:00:00.000Z" }),
      movement({ id: "b", occurred_at: "2026-09-30T15:00:00.000Z" }),
    ]);

    await userEvent.click(screen.getByRole("button", { name: /Hora/ }));

    expect(rowsOf(screen).map((row) => row.slice(0, 5))).toEqual(["09:00", "12:00"]);
  });

  it("counts the movements it lists", async () => {
    const screen = await renderTable([
      movement({ id: "a" }),
      movement({ id: "b", type: "CASH_OUT", reason: "Flete" }),
    ]);

    await expect.element(screen.getByText("2 movimientos")).toBeVisible();
  });

  it("counts a single movement in the singular", async () => {
    const screen = await renderTable([movement()]);

    await expect.element(screen.getByText("1 movimiento", { exact: true })).toBeVisible();
  });

  it("filters by movement type, starting with every type", async () => {
    const screen = await renderTable([
      movement({ id: "a", type: "CASH_IN", reason: "Cambio" }),
      movement({ id: "b", type: "CASH_OUT", reason: "Flete" }),
      movement({ id: "c", type: "CASH_OUT", reason: "Luz" }),
    ]);
    expect(rowsOf(screen)).toHaveLength(3);
    await expect.element(screen.getByRole("button", { name: "Tipo: Todos" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Gasto" }));

    expect(rowsOf(screen)).toHaveLength(2);
    await expect.element(screen.getByText("2 movimientos")).toBeVisible();
  });

  it("offers every movement type in the filter", async () => {
    const screen = await renderTable([movement()]);

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));

    const options = Array.from(document.querySelectorAll("[role=option]")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "Todos",
      "Apertura de sesión",
      "Venta",
      "Vuelto",
      "Devolución en efectivo",
      "Ingreso de efectivo",
      "Gasto",
      "Retiro a caja fuerte",
      "Cierre de sesión",
    ]);
  });

  it("says so when no movement is of the chosen type", async () => {
    const screen = await renderTable([movement()]);

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Gasto" }));

    await expect.element(screen.getByText("No hay movimientos de este tipo")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    const screen = await renderTable([
      movement({ type: "OPENING", id: "a" }),
      movement({ type: "CASH_OUT", id: "b", reason: "Flete", authorized_by: GRACE }),
    ]);

    await expectNoAccessibilityViolations(screen.container);
  });
});
