import { expect } from "vitest";
import { userEvent } from "vitest/browser";
import type { render } from "../../shell/test-support/render-with-router";

type Screen = Awaited<ReturnType<typeof render>>;

type Scope = Pick<Screen, "getByRole">;

// A locator click scrolls the option into view first, and the scroll event closes the list.
async function chooseProduct(screen: Screen, scope: Scope, name: string) {
  await userEvent.click(scope.getByRole("combobox", { name: /^Producto/ }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

export function purchaseLine(scope: Scope, number: number) {
  return scope.getByRole("group", { name: `Línea ${number}` });
}

export async function fillQuantityLine(
  screen: Screen,
  scope: Scope,
  { product, quantity, cost }: { product: string; quantity: string; cost: string },
  number = 1,
) {
  const group = purchaseLine(scope, number);
  await chooseProduct(screen, group, product);
  await userEvent.fill(group.getByRole("textbox", { name: /^Cantidad/ }), quantity);
  await userEvent.fill(group.getByRole("textbox", { name: /^Costo por/ }), cost);
}
