import { FigureStat } from "@purosur/ui";
import { expect } from "vitest";
import { render } from "vitest-browser-react";

const DRAWN_PROPERTIES = ["fontSize", "fontWeight", "color", "textTransform"] as const;

function expectDrawnAlike(shown: Element, reference: Element) {
  const shownStyle = getComputedStyle(shown);
  const referenceStyle = getComputedStyle(reference);
  for (const property of DRAWN_PROPERTIES) {
    expect(shownStyle[property], property).toBe(referenceStyle[property]);
  }
}

export async function expectDrawnAsFigureStat(
  label: Element,
  value: Element,
  size: "display" | "heading" = "display",
) {
  const reference = await render(<FigureStat size={size} label="Referencia" value="$ 1,00" />);
  const referenceLabel = reference.getByText("Referencia", { exact: true }).element();
  const referenceValue = reference.getByText("$ 1,00", { exact: true }).element();

  expectDrawnAlike(label, referenceLabel);
  expectDrawnAlike(value, referenceValue);
  expect(value.getBoundingClientRect().top - label.getBoundingClientRect().bottom).toBeCloseTo(
    referenceValue.getBoundingClientRect().top - referenceLabel.getBoundingClientRect().bottom,
    0,
  );
  await reference.unmount();
}
