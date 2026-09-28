import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PuroSurLogo } from "./PuroSurLogo";

test("renders the brand kit's default logo named after the brand", async () => {
  const screen = await render(<PuroSurLogo />);

  const image = screen.getByRole("img", { name: "Puro Sur" }).element() as HTMLImageElement;
  expect(image.tagName).toBe("IMG");
  expect(image.src).toContain("puro-sur-logo");
});
