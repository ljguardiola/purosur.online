import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ScreenPending } from "./screen-pending";

test("tells a screen reader that the screen is loading", async () => {
  const screen = await render(<ScreenPending />);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});
