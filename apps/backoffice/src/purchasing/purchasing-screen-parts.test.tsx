import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ExpectedTotalAmount } from "./purchasing-screen-parts";

test("shows the amount in pesos", async () => {
  const screen = await render(<ExpectedTotalAmount cents={555_000} hasUnpricedLine={false} />);

  await expect.element(screen.getByText("$ 5.550,00")).toBeVisible();
  expect(screen.getByText("Hay líneas sin precio de lista").query()).toBeNull();
});

test("warns when some line has no list price", async () => {
  const screen = await render(<ExpectedTotalAmount cents={555_000} hasUnpricedLine />);

  await expect.element(screen.getByText("$ 5.550,00")).toBeVisible();
  await expect.element(screen.getByText("Hay líneas sin precio de lista")).toBeVisible();
});
