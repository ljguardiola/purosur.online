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
  countedLabel = null,
}: {
  product?: ReturnType<typeof withoutBalance>;
  balance?: CloudData<StockProductBalance>;
  counted?: number;
  countedLabel?: string | null;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CountBalance
          product={product}
          balance={balance}
          counted={counted}
          countedLabel={countedLabel}
        />
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

test("shows a difference over the expected balance with a plus sign", async () => {
  const screen = await renderBalance({ counted: 18_000 });

  await expect.element(screen.getByText("+ 1 u")).toBeVisible();
});

test("says there is no difference when the count equals the expected balance", async () => {
  const screen = await renderBalance({ counted: 17_000 });

  await expect.element(screen.getByText("Sin diferencia")).toBeVisible();
});

test("shows what was counted above the expected balance under the label it is given", async () => {
  const screen = await renderBalance({
    product: withoutBalance(almonds),
    balance: loaded(expectedBalance(almonds, 12_400)),
    counted: 12_150,
    countedLabel: "Total contado",
  });

  expect(rowsText(screen.container)).toBe(
    "Total contado12,150 kgSaldo esperado12,400 kgDiferencia− 0,250 kg",
  );
});

test("shows a placeholder and no balance while the expected balance loads", async () => {
  const screen = await renderBalance({ balance: { status: "loading" }, counted: 16_000 });

  expect(screen.container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByText("Saldo esperado").query()).toBeNull();
});

test("says the expected balance could not be opened, with a Reintentar that loads it again", async () => {
  const retry = vi.fn();
  const screen = await renderBalance({ balance: { status: "failed", retry }, counted: 16_000 });

  await expect.element(screen.getByText("No pudimos abrir el saldo esperado")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
