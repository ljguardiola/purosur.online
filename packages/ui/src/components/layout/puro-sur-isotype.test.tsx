import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PuroSurIsotype } from "./puro-sur-isotype";

test("renders the brand kit's isotype named after the brand", async () => {
  const screen = await render(<PuroSurIsotype />);

  const image = screen.getByRole("img", { name: "Puro Sur" }).element() as HTMLImageElement;
  expect(image.tagName).toBe("IMG");
  expect(image.src).toContain("puro-sur-iso");
});
