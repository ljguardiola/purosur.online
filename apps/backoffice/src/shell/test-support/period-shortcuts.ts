import { type Locator, page, userEvent } from "vitest/browser";

type Scope = Pick<Locator, "getByRole">;

export function periodShortcuts(scope: Scope) {
  return scope.getByRole("radiogroup", { name: "Atajos de período" });
}

export async function choosePeriodShortcut(scope: Scope, name: string) {
  const radio = periodShortcuts(scope).getByRole("radio", { name }).element();
  await userEvent.click(page.elementLocator(radio.closest("label") as HTMLElement));
}
