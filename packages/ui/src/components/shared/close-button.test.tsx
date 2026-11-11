import { beforeEach, expect, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CloseButton } from "./close-button";

beforeEach(async () => {
  await page.viewport(1280, 900);
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  window.focus();
});

test("shows its name as a tooltip when hovered", async () => {
  const screen = await render(<CloseButton onPress={() => {}} />);

  await userEvent.hover(screen.getByRole("button", { name: "Cerrar" }));

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Cerrar");
});

test("is disabled when told so", async () => {
  const screen = await render(<CloseButton onPress={() => {}} disabled />);

  await expect.element(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
});
