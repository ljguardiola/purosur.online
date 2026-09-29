import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ScreenPending } from "./screen-pending";

test("shows the loading placeholder and announces the loading to a screen reader", async () => {
  const screen = await render(<ScreenPending />);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.container.querySelector('[aria-hidden="true"]')?.children.length).toBeGreaterThan(
    0,
  );
});
