import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { PuroSurIsotype } from "./PuroSurIsotype";

test("renders the brand kit's isotype named after the brand", async () => {
  const screen = await render(<PuroSurIsotype />);

  const image = screen.getByRole("img", { name: "Puro Sur" }).element() as HTMLImageElement;
  expect(image.tagName).toBe("IMG");
  expect(image.src).toContain("puro-sur-iso");
});

test("has no accessibility violations", async () => {
  const screen = await render(<PuroSurIsotype />);
  await expectNoAccessibilityViolations(screen.container);
});
