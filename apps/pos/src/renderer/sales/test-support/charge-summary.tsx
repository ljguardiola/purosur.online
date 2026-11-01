import { SummaryRowGroup } from "@purosur/ui";
import { expect } from "vitest";
import { render } from "vitest-browser-react";

type ChargeSummaryScreen = {
  getByText: (text: string, options: { exact: true }) => { element: () => Element };
};

const DRAWN_PROPERTIES = ["fontSize", "fontWeight", "color"] as const;

function valueBeside(label: Element): Element {
  const value = label.nextElementSibling;
  expect(value).not.toBeNull();
  return value as Element;
}

export async function expectChargeSummaryInColumns(
  screen: ChargeSummaryScreen,
  labels: readonly [string, string, string],
) {
  const shownLabels = labels.map((label) => screen.getByText(label, { exact: true }).element());
  const boxes = shownLabels.map((label) =>
    (label.parentElement as Element).getBoundingClientRect(),
  );
  for (const [index, box] of boxes.entries()) {
    const previous = boxes[index - 1];
    if (previous !== undefined) {
      expect(box.left).toBeGreaterThan(previous.right);
      expect(box.top).toBeLessThan(previous.bottom);
      expect(box.bottom).toBeGreaterThan(previous.top);
    }
  }

  const referenceLabels = ["Referencia 1", "Referencia 2", "Referencia 3"] as const;
  const reference = await render(
    <SummaryRowGroup
      variant="filled"
      orientation="horizontal"
      rows={[
        { label: referenceLabels[0], value: "$ 1,00" },
        { label: referenceLabels[1], value: "$ 2,00" },
        { label: referenceLabels[2], value: "$ 3,00", emphasized: true },
      ]}
    />,
  );
  for (const [index, label] of shownLabels.entries()) {
    const referenceValue = valueBeside(
      reference.getByText(referenceLabels[index] ?? "", { exact: true }).element(),
    );
    const shownStyle = getComputedStyle(valueBeside(label));
    const referenceStyle = getComputedStyle(referenceValue);
    for (const property of DRAWN_PROPERTIES) {
      expect(shownStyle[property], `${labels[index]} ${property}`).toBe(referenceStyle[property]);
    }
  }
  await reference.unmount();
}
