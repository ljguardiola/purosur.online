import { type Locator, userEvent } from "vitest/browser";

type Scope = Pick<Locator, "getByRole">;

function periodSegmentsOf(scope: Scope) {
  return scope.getByRole("group", { name: /^Período/ }).getByRole("spinbutton");
}

const END_FIRST_SEGMENT = 3;

export async function typePeriodStart(scope: Scope, digits: string) {
  await userEvent.click(periodSegmentsOf(scope).first());
  await userEvent.keyboard(digits);
}

export async function typePeriodEnd(scope: Scope, digits: string) {
  await userEvent.click(periodSegmentsOf(scope).nth(END_FIRST_SEGMENT));
  await userEvent.keyboard(digits);
}

export async function erasePeriodEnd(scope: Scope, end: "start" | "end") {
  const segments = periodSegmentsOf(scope).all();
  for (const segment of end === "start"
    ? segments.slice(0, END_FIRST_SEGMENT)
    : segments.slice(END_FIRST_SEGMENT)) {
    await userEvent.click(segment);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
  }
}

export function periodSegments(scope: Scope) {
  return periodSegmentsOf(scope)
    .all()
    .map((segment) => segment.element().textContent);
}
