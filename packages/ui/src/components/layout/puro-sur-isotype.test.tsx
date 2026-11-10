import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PuroSurIsotype } from "./puro-sur-isotype";

test("renders the brand kit's isotype named after the brand", async () => {
  const screen = await render(<PuroSurIsotype />);

  const image = screen.getByRole("img", { name: "Puro Sur" }).element() as HTMLImageElement;
  expect(image.tagName).toBe("IMG");
  expect(image.src).toContain("puro-sur-iso");
});

test("stays out of the accessibility tree when it only decorates", async () => {
  const screen = await render(<PuroSurIsotype decorative />);

  await expect.element(screen.getByRole("img", { name: "Puro Sur" })).not.toBeInTheDocument();
  const image = screen.container.querySelector("img") as HTMLImageElement;
  expect(image.alt).toBe("");
  expect(image.src).toContain("puro-sur-iso");
});
