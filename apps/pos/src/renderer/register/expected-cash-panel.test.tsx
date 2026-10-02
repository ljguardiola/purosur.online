import type { CashBalance } from "@purosur/contracts";
import { SummaryRowGroup } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreData } from "../platform/use-core-query";
import { ExpectedCashPanel } from "./expected-cash-panel";

const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 3_500_000, direction: "in" },
  change_given: { amount: 930_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 100_000, direction: "in" },
  expenses: { amount: 50_000, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 4_620_000,
};

function loaded(balance: CashBalance): CoreData<CashBalance> {
  return { status: "loaded", value: balance, refreshing: false };
}

async function renderPanel(
  props: { balance?: CoreData<CashBalance>; eyebrow?: string; actions?: string } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <ExpectedCashPanel
      eyebrow={props.eyebrow ?? "EFECTIVO ESPERADO AHORA"}
      balance={props.balance ?? loaded(BALANCE)}
    >
      {props.actions === undefined ? null : <button type="button">{props.actions}</button>}
    </ExpectedCashPanel>,
  );
}

function rowOf(screen: Awaited<ReturnType<typeof renderPanel>>, label: string) {
  return screen.getByText(label, { exact: true }).element().closest("div")?.textContent;
}

describe("ExpectedCashPanel", () => {
  it("shows the eyebrow it is given and the expected cash in pesos", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("takes its eyebrow from the screen that uses it", async () => {
    const screen = await renderPanel({ eyebrow: "EFECTIVO ESPERADO" });

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).not.toBeInTheDocument();
  });

  it("breaks the expected cash down with the direction of each line", async () => {
    const screen = await renderPanel();

    expect(rowOf(screen, "Fondo inicial")).toBe("Fondo inicial$ 20.000,00");
    expect(rowOf(screen, "Ventas en efectivo")).toBe("Ventas en efectivo+ $ 35.000,00");
    expect(rowOf(screen, "Vuelto entregado")).toBe("Vuelto entregado− $ 9.300,00");
    expect(rowOf(screen, "Ingresos")).toBe("Ingresos+ $ 1.000,00");
    expect(rowOf(screen, "Gastos")).toBe("Gastos− $ 500,00");
  });

  it("shows the breakdown as the design system's summary rows", async () => {
    const screen = await renderPanel();
    const reference = await render(
      <SummaryRowGroup rows={[{ label: "Referencia", value: "$ 1,00" }]} />,
    );

    const label = screen.getByText("Fondo inicial", { exact: true }).element();
    const value = screen.getByText("$ 20.000,00", { exact: true }).element();
    const group = label.parentElement?.parentElement as HTMLElement;
    const referenceLabel = reference.getByText("Referencia", { exact: true }).element();
    const referenceValue = reference.getByText("$ 1,00", { exact: true }).element();
    const referenceGroup = reference.container.firstElementChild as HTMLElement;
    for (const [shown, summary] of [
      [label, referenceLabel],
      [value, referenceValue],
    ] as const) {
      expect(getComputedStyle(shown).color).toBe(getComputedStyle(summary).color);
      expect(getComputedStyle(shown).fontWeight).toBe(getComputedStyle(summary).fontWeight);
    }
    expect(getComputedStyle(group).borderTop).toBe(getComputedStyle(referenceGroup).borderTop);
    expect(getComputedStyle(group).borderBottom).toBe(
      getComputedStyle(referenceGroup).borderBottom,
    );
    expect(getComputedStyle(group).paddingTop).toBe(getComputedStyle(referenceGroup).paddingTop);
  });

  it("keeps a line with no movement, and leaves Devoluciones out while there are no refunds", async () => {
    const screen = await renderPanel();

    expect(rowOf(screen, "Retiros")).toBe("Retiros− $ 0,00");
    await expect.element(screen.getByText("Devoluciones")).not.toBeInTheDocument();
  });

  it("shows Devoluciones as an outflow once there are refunds", async () => {
    const screen = await renderPanel({
      balance: loaded({ ...BALANCE, refunds: { amount: 120_000, direction: "out" } }),
    });

    expect(rowOf(screen, "Devoluciones")).toBe("Devoluciones− $ 1.200,00");
  });

  it("shows a zero cash line as positive when it is an inflow", async () => {
    const screen = await renderPanel({
      balance: loaded({
        ...BALANCE,
        cash_sales: { amount: 0, direction: "in" },
        cash_in: { amount: 0, direction: "in" },
      }),
    });

    expect(rowOf(screen, "Ventas en efectivo")).toBe("Ventas en efectivo+ $ 0,00");
    expect(rowOf(screen, "Ingresos")).toBe("Ingresos+ $ 0,00");
  });

  it("signs each line by the direction the core gives it", async () => {
    const screen = await renderPanel({
      balance: loaded({
        ...BALANCE,
        cash_sales: { amount: 3_500_000, direction: "out" },
        expenses: { amount: 50_000, direction: "in" },
        withdrawals: { amount: 70_000, direction: "none" },
      }),
    });

    expect(rowOf(screen, "Ventas en efectivo")).toBe("Ventas en efectivo− $ 35.000,00");
    expect(rowOf(screen, "Gastos")).toBe("Gastos+ $ 500,00");
    expect(rowOf(screen, "Retiros")).toBe("Retiros$ 700,00");
  });

  it("shows no amounts while the balance loads", async () => {
    const screen = await renderPanel({ balance: { status: "loading" } });

    await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).toBeVisible();
    await expect.element(screen.getByText("Fondo inicial")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the balance could not be read and offers Reintentar", async () => {
    const onRetry = vi.fn();
    const screen = await renderPanel({ balance: { status: "failed", retry: onRetry } });

    await expect.element(screen.getByText("No se pudo leer el efectivo esperado")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the actions the screen gives it under the balance", async () => {
    const screen = await renderPanel({ actions: "Cerrar caja" });

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeVisible();
  });

  it("keeps the actions while the balance loads or fails", async () => {
    const loading = await renderPanel({ balance: { status: "loading" }, actions: "Volver" });
    await expect.element(loading.getByRole("button", { name: "Volver" })).toBeVisible();
    await loading.unmount();

    const failed = await renderPanel({
      balance: { status: "failed", retry: vi.fn() },
      actions: "Volver",
    });
    await expect.element(failed.getByRole("button", { name: "Volver" })).toBeVisible();
  });
});
