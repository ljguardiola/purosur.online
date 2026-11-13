import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { focusFirstInput } from "./focus-first-input";

it("focuses the first input inside the container, past anything that is not an input", async () => {
  const screen = await render(
    <form ref={focusFirstInput}>
      <button type="button">Pedir otro código</button>
      <input aria-label="Código" />
      <input aria-label="PIN nuevo" />
    </form>,
  );

  await expect.element(screen.getByLabelText("Código")).toHaveFocus();
});

it("leaves the focus where it was when there is no container", () => {
  const before = document.activeElement;

  focusFirstInput(null);

  expect(document.activeElement).toBe(before);
});
