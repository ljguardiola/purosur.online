import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { groupedEan13Digits, LabelPreviewBars } from "./label-preview-bars";

test("groups an EAN-13 code as its first digit alone, then two halves of six digits", () => {
  expect(groupedEan13Digits("2000000000015")).toBe("2 000000 000015");
});

test("draws each run of dark modules as one bar, at its position and as wide as the run", async () => {
  const modules =
    "10100011010001101010011101001110001101010011101010111001011100101110010111001011001101001110101";
  const screen = await render(<LabelPreviewBars modules={modules} />);

  const svg = screen.container.querySelector("svg");
  const bars = [...(svg?.querySelectorAll("rect") ?? [])].map((rect) => ({
    start: Number(rect.getAttribute("x")),
    width: Number(rect.getAttribute("width")),
  }));
  const runs = [...modules.matchAll(/1+/g)].map((run) => ({
    start: run.index,
    width: run[0].length,
  }));
  expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${modules.length} 40`);
  expect(bars).toEqual(runs);
});
