import { type Locator, userEvent } from "vitest/browser";

type Scope = Pick<Locator, "getByRole">;

function dateSegmentsOf(scope: Scope, label: "Desde" | "Hasta") {
  return scope.getByRole("group", { name: new RegExp(`^${label}`) }).getByRole("spinbutton");
}

export async function typeDate(scope: Scope, label: "Desde" | "Hasta", digits: string) {
  await userEvent.click(dateSegmentsOf(scope, label).first());
  await userEvent.keyboard(digits);
}

export function dateSegments(scope: Scope, label: "Desde" | "Hasta") {
  return dateSegmentsOf(scope, label)
    .all()
    .map((segment) => segment.element().textContent);
}
