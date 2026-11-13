import type { ListedCashMovement } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreData } from "../platform/use-core-query";
import { CashMovementsTable } from "./cash-movements-table";

const ADA = { user_id: "u1", first_name: "Ada" };
const GRACE = { user_id: "u2", first_name: "Grace" };

function movement(overrides: Partial<ListedCashMovement> = {}): ListedCashMovement {
  return {
    id: "m1",
    type: "CASH_IN",
    amount: 500_000,
    reason: null,
    direction: "in",
    occurred_at: "2026-09-30T12:05:00.000-03:00",
    actor: ADA,
    authorized_by: null,
    ...overrides,
  };
}

async function renderState(
  state: CoreData<ListedCashMovement[]>,
  props: { locked?: boolean } = {},
) {
  await page.viewport(1280, 720);
  return render(
    <CashMovementsTable
      state={state}
      legend={[
        { keyName: "1", label: "Ingreso" },
        { keyName: "2", label: "Gasto" },
        { keyName: "3", label: "Retiro" },
        { keyName: "F12", label: "Cerrar caja" },
      ]}
      {...props}
    />,
  );
}

function renderTable(movements: ListedCashMovement[], props: { locked?: boolean } = {}) {
  return renderState({ status: "loaded", value: movements, refreshing: false }, props);
}

function rowsOf(screen: Awaited<ReturnType<typeof renderTable>>) {
  return Array.from(screen.container.querySelectorAll("tbody tr")).map(
    (row) => row.textContent ?? "",
  );
}

function timesOf(screen: Awaited<ReturnType<typeof renderTable>>) {
  return rowsOf(screen).map((row) => row.match(/\d\d:\d\d/)?.[0]);
}

function movementsEveryMinute(count: number) {
  return Array.from({ length: count }, (_, index) =>
    movement({
      id: `m${index}`,
      occurred_at: `2026-09-30T09:${String(index).padStart(2, "0")}:00.000-03:00`,
    }),
  );
}

describe("CashMovementsTable", () => {
  it("heads its columns Movimiento, Hora, Quién and Importe, in that order", async () => {
    const screen = await renderTable([movement()]);

    const headers = Array.from(screen.container.querySelectorAll("thead th")).map(
      (header) => header.textContent,
    );
    expect(headers).toEqual(["Movimiento", "Hora", "Quién", "Importe"]);
  });

  it.each<
    [CashMovementType, ListedCashMovement["direction"], string | null, string, string, string]
  >([
    ["OPENING", "in", null, "Apertura", "Fondo inicial", "$ 5.000,00"],
    ["CASH_IN", "in", "Cambio para el cajón", "Ingreso", "Cambio para el cajón", "$ 5.000,00"],
    ["CASH_OUT", "out", "Flete", "Gasto", "Flete", "\u2013 $ 5.000,00"],
    ["WITHDRAWAL", "out", "Fin de turno", "Retiro", "Fin de turno", "\u2013 $ 5.000,00"],
    ["SALE", "in", null, "Venta", "Cobro en efectivo", "$ 5.000,00"],
    ["CHANGE", "out", null, "Vuelto", "", "\u2013 $ 5.000,00"],
    ["REFUND", "out", null, "Devolución en efectivo", "", "\u2013 $ 5.000,00"],
    ["CLOSING", "none", null, "Cierre de sesión", "", "$ 5.000,00"],
  ])("presents a %s movement", async (type, direction, reason, title, secondLine, amount) => {
    const screen = await renderTable([movement({ type, direction, reason })]);

    const [row] = rowsOf(screen);
    expect(row).toBe(`${title}${secondLine}12:05Ada${amount}`);
  });

  it.each<[ListedCashMovement["direction"], string]>([
    ["in", "$ 5.000,00"],
    ["out", "\u2013 $ 5.000,00"],
    ["none", "$ 5.000,00"],
  ])(
    "marks the amount by the direction the core gives, not by the type: %s",
    async (direction, amount) => {
      const screen = await renderTable([movement({ type: "CASH_IN", direction })]);

      expect(rowsOf(screen)[0]?.endsWith(amount)).toBe(true);
    },
  );

  it("names the person who authorized a movement under the one who recorded it", async () => {
    const screen = await renderTable([movement({ authorized_by: GRACE })]);

    const [row] = rowsOf(screen);
    expect(row).toContain("Adaautorizó Grace");
  });

  it("shows the time on the clock the movement is written in", async () => {
    const screen = await renderTable([movement({ occurred_at: "2026-09-30T23:30:00.000-03:00" })]);

    expect(rowsOf(screen)[0]).toContain("23:30");
  });

  it("lists the newest movement first", async () => {
    const screen = await renderTable([
      movement({ id: "a", occurred_at: "2026-09-30T09:00:00.000-03:00" }),
      movement({ id: "c", occurred_at: "2026-09-30T15:00:00.000-03:00" }),
      movement({ id: "b", occurred_at: "2026-09-30T12:00:00.000-03:00" }),
    ]);

    expect(timesOf(screen)).toEqual(["15:00", "12:00", "09:00"]);
  });

  it("lists the oldest movement first once the time column is sorted the other way", async () => {
    const screen = await renderTable([
      movement({ id: "a", occurred_at: "2026-09-30T09:00:00.000-03:00" }),
      movement({ id: "b", occurred_at: "2026-09-30T12:00:00.000-03:00" }),
    ]);

    await userEvent.click(screen.getByRole("button", { name: /Hora/ }));

    expect(timesOf(screen)).toEqual(["09:00", "12:00"]);
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

  it("counts the movements with the thousands separator", async () => {
    const screen = await renderTable(
      Array.from({ length: 1998 }, (_, index) => movement({ id: `m${index}` })),
    );

    await expect.element(screen.getByText("1.998 movimientos")).toBeVisible();
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

  it("offers every type an open session can hold in the filter", async () => {
    const screen = await renderTable([movement()]);

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));

    const options = Array.from(document.querySelectorAll("[role=option]")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "Todos",
      "Apertura",
      "Venta",
      "Vuelto",
      "Devolución en efectivo",
      "Ingreso",
      "Gasto",
      "Retiro",
    ]);
  });

  it("says so when no movement is of the chosen type and keeps the filter to change it", async () => {
    const screen = await renderTable([movement()]);

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Gasto" }));

    await expect.element(screen.getByText("No hay movimientos de este tipo")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tipo: Gasto" })).toBeVisible();
  });

  it("lists the newest 25 movements and counts all of them", async () => {
    const screen = await renderTable(movementsEveryMinute(30));

    const times = timesOf(screen);
    expect(times).toHaveLength(25);
    expect(times[0]).toBe("09:29");
    expect(times[24]).toBe("09:05");
    await expect.element(screen.getByText("30 movimientos")).toBeVisible();
  });

  it("shows the remaining movements on the next page", async () => {
    const screen = await renderTable(movementsEveryMinute(30));

    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

    expect(timesOf(screen)).toEqual(["09:04", "09:03", "09:02", "09:01", "09:00"]);
    await expect.element(screen.getByText("30 movimientos")).toBeVisible();
  });

  it("goes back to the first page when a type is chosen", async () => {
    const screen = await renderTable([
      ...movementsEveryMinute(30),
      movement({ id: "x", type: "CASH_OUT", reason: "Flete" }),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Ingreso" }));

    expect(timesOf(screen)[0]).toBe("09:29");
    expect(rowsOf(screen)).toHaveLength(25);
  });

  it("shows no pager and no count once no movement is of the chosen type", async () => {
    const screen = await renderTable(movementsEveryMinute(30));
    await expect
      .element(screen.getByRole("navigation", { name: "Páginas de movimientos" }))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Tipo: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Gasto" }));

    await expect
      .element(screen.getByRole("navigation", { name: "Páginas de movimientos" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("0 movimientos")).not.toBeInTheDocument();
  });

  it("has no accessibility violations with the pager", async () => {
    const screen = await renderTable(movementsEveryMinute(30));

    await expectNoAccessibilityViolations(screen.container);
  });

  it("draws each movement's icon in the circle of the table's cell text", async () => {
    const screen = await renderTable([movement({ type: "CASH_OUT", direction: "out" })]);

    const circle = screen.container.querySelector("tbody tr td span.rounded-full.bg-surface");
    expect(circle?.querySelector("svg")).not.toBeNull();
  });

  it("shows the key legend it is given under the movements", async () => {
    const screen = await renderTable([movement()]);

    const legend = Array.from(screen.container.querySelectorAll("ul li")).map(
      (item) => item.textContent,
    );
    expect(legend).toEqual(["1Ingreso", "2Gasto", "3Retiro", "F12Cerrar caja"]);
  });

  it("dims the movements and drops the legend while the screen is locked by a panel", async () => {
    const screen = await renderTable([movement()], { locked: true });

    await expect.element(screen.getByRole("img", { name: "Movimientos bloqueados" })).toBeVisible();
    expect(screen.container.querySelectorAll("ul li")).toHaveLength(0);
    expect(rowsOf(screen)).toHaveLength(1);
  });

  it("says there are no movements yet when the session has none", async () => {
    const screen = await renderTable([]);

    await expect.element(screen.getByText("Todavía no hay movimientos")).toBeVisible();
  });

  it("shows no movement while they load", async () => {
    const screen = await renderState({ status: "loading" });

    await expect
      .element(screen.getByRole("table", { name: "Movimientos de la sesión" }))
      .toHaveAttribute("aria-busy", "true");
    expect(rowsOf(screen).join("")).toBe("");
    await expect.element(screen.getByText("Todavía no hay movimientos")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("keeps the movements it shows while they are read again", async () => {
    const screen = await renderState({ status: "loaded", value: [movement()], refreshing: true });

    await expect
      .element(screen.getByRole("table", { name: "Movimientos de la sesión" }))
      .toHaveAttribute("aria-busy", "true");
    expect(rowsOf(screen)).toHaveLength(1);
  });

  it("says the movements could not be read and offers Reintentar", async () => {
    const onRetry = vi.fn();
    const screen = await renderState({ status: "failed", retry: onRetry });

    await expect.element(screen.getByText("No se pudieron leer los movimientos")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("has no accessibility violations", async () => {
    const screen = await renderTable([
      movement({ type: "OPENING", id: "a" }),
      movement({ type: "CASH_OUT", id: "b", reason: "Flete", authorized_by: GRACE }),
    ]);

    await expectNoAccessibilityViolations(screen.container);
  });
});
