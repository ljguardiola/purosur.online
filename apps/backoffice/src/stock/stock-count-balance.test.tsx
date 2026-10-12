import type { StockProductBalance } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import { CountBalance } from "./stock-count-balance";
import { almonds, expectedBalance, tea, withoutBalance } from "./test-support/stock-fixtures";

function loaded(value: StockProductBalance): CloudData<StockProductBalance> {
  return { status: "loaded", value, refreshing: false };
}

function renderBalance({
  product = withoutBalance(tea),
  balance = loaded(expectedBalance(tea, 17_000)),
  counted,
  mode = "product",
}: {
  product?: ReturnType<typeof withoutBalance>;
  balance?: CloudData<StockProductBalance>;
  counted?: number;
  mode?: "product" | "lots";
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CountBalance product={product} balance={balance} counted={counted} mode={mode} />
      </main>
    </FieldSizeProvider>,
  );
}

function rowsText(container: HTMLElement): string {
  return container.textContent ?? "";
}

test("shows only the expected balance while nothing counted can be read", async () => {
  const screen = await renderBalance({});

  await expect.element(screen.getByText("Saldo esperado")).toBeVisible();
  await expect.element(screen.getByText("17 u")).toBeVisible();
  expect(screen.getByText("Diferencia").query()).toBeNull();
});

test("shows the expected balance and the difference with what was counted", async () => {
  const screen = await renderBalance({ counted: 16_000 });

  expect(rowsText(screen.container)).toBe("Saldo esperado17 uDiferencia− 1 u");
  await expectNoAccessibilityViolations(screen.container);
});

function classesOf(screen: Awaited<ReturnType<typeof renderBalance>>, text: string): string {
  return (screen.getByText(text, { exact: true }).element() as HTMLElement).className;
}

test("writes a difference under the expected balance in red, in bold", async () => {
  const screen = await renderBalance({ counted: 16_000 });

  expect(classesOf(screen, "− 1 u")).toContain("text-error-strong");
  expect(classesOf(screen, "− 1 u")).toContain("font-bold");
  expect(classesOf(screen, "17 u")).not.toContain("text-error-strong");
});

test("shows a difference over the expected balance with a plus sign, not in red", async () => {
  const screen = await renderBalance({ counted: 18_000 });

  await expect.element(screen.getByText("+ 1 u")).toBeVisible();
  expect(classesOf(screen, "+ 1 u")).not.toContain("text-error-strong");
});

test("says there is no difference when the count equals the expected balance, not in red", async () => {
  const screen = await renderBalance({ counted: 17_000 });

  await expect.element(screen.getByText("Sin diferencia")).toBeVisible();
  expect(classesOf(screen, "Sin diferencia")).not.toContain("text-error-strong");
});

test("draws the figures without a card of their own when counting by product", async () => {
  const screen = await renderBalance({ counted: 16_000 });
  const figures = screen.getByText("Saldo esperado").element().parentElement?.parentElement;

  expect(getComputedStyle(figures as HTMLElement).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

const ALMONDS = {
  product: withoutBalance(almonds),
  balance: loaded(expectedBalance(almonds, 12_400)),
  mode: "lots",
} as const;

test("shows what was counted, the expected balance and the difference in a card when counting by lot", async () => {
  const screen = await renderBalance({ ...ALMONDS, counted: 12_150 });

  expect(rowsText(screen.container)).toBe(
    "Total contado12,150 kgSaldo esperado12,400 kgDiferencia− 0,250 kg",
  );
  expect(
    getComputedStyle(
      screen.getByText("Total contado").element().parentElement?.parentElement as HTMLElement,
    ).backgroundColor,
  ).not.toBe("rgba(0, 0, 0, 0)");
  await expectNoAccessibilityViolations(screen.container);
});

test("writes the expected balance subtle and a negative difference in red when counting by lot", async () => {
  const screen = await renderBalance({ ...ALMONDS, counted: 12_150 });

  expect(classesOf(screen, "12,400 kg")).toContain("text-text-subtle");
  expect(classesOf(screen, "12,150 kg")).not.toContain("text-text-subtle");
  expect(classesOf(screen, "− 0,250 kg")).toContain("text-error-strong");
});

test.each([
  [12_600, "+ 0,200 kg"],
  [12_400, "Sin diferencia"],
])("does not write a difference of %s in red when counting by lot", async (counted, difference) => {
  const screen = await renderBalance({ ...ALMONDS, counted });

  expect(classesOf(screen, difference)).not.toContain("text-error-strong");
});

test("shows only the expected balance while the lots' total cannot be read", async () => {
  const screen = await renderBalance({ ...ALMONDS });

  expect(rowsText(screen.container)).toBe("Saldo esperado12,400 kg");
});

async function loadingShapes(mode: "product" | "lots") {
  const screen = await renderBalance({ balance: { status: "loading" }, counted: 16_000, mode });
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByText("Saldo esperado").query()).toBeNull();
  return getComputedStyle(screen.container.querySelector('[aria-hidden="true"]') as HTMLElement);
}

test("draws unframed lines and no balance while the expected balance loads, counting by product", async () => {
  const shapes = await loadingShapes("product");

  expect(shapes.borderTopWidth).toBe("0px");
  expect(shapes.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("draws a card and no balance while the expected balance loads, counting by lot", async () => {
  const shapes = await loadingShapes("lots");

  expect(shapes.borderTopWidth).not.toBe("0px");
  expect(shapes.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("says the expected balance could not be opened, with a Reintentar that loads it again", async () => {
  const retry = vi.fn();
  const screen = await renderBalance({ balance: { status: "failed", retry }, counted: 16_000 });

  await expect.element(screen.getByText("No pudimos abrir el saldo esperado")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
