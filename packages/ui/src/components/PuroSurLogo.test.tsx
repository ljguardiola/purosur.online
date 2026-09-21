import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { PuroSurLogo } from "./PuroSurLogo";

test("renders the brand kit's default logo with the given accessible name", async () => {
  const screen = await render(<PuroSurLogo alt="Puro Sur" />);

  const image = screen.getByRole("img", { name: "Puro Sur" }).element() as HTMLImageElement;
  expect(image.tagName).toBe("IMG");
  expect(image.src).toContain("puro-sur-logo");
});

test("has no accessibility violations", async () => {
  const screen = await render(<PuroSurLogo alt="Puro Sur" />);
  await expectNoAccessibilityViolations(screen.container);
});
