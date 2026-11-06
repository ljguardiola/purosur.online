import { useState } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ReservedWidthLabel } from "./reserved-width-label";

function SelectableLabel() {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      className="group inline-flex"
      data-selected={selected || undefined}
      onClick={() => setSelected(true)}
    >
      <ReservedWidthLabel label="Movimientos de efectivo" />
    </button>
  );
}

test("keeps its width when its group turns selected and the label turns bold", async () => {
  const screen = await render(<SelectableLabel />);
  const button = screen.getByRole("button").element() as HTMLButtonElement;
  await document.fonts.ready;
  const widthBefore = button.getBoundingClientRect().width;

  await userEvent.click(button);
  await expect.poll(() => button.hasAttribute("data-selected")).toBe(true);

  const visibleLabel = screen.getByText("Movimientos de efectivo", { exact: true }).last();
  expect(getComputedStyle(visibleLabel.element()).fontWeight).toBe("700");
  expect(button.getBoundingClientRect().width).toBeCloseTo(widthBefore, 0);
});

test("names its group with the label once", async () => {
  const screen = await render(<SelectableLabel />);

  expect(screen.getByRole("button").element().textContent).toBe(
    "Movimientos de efectivoMovimientos de efectivo",
  );
  await expect
    .element(screen.getByRole("button", { name: "Movimientos de efectivo", exact: true }))
    .toBeInTheDocument();
});
