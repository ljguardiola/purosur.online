import { beforeEach, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { tokenStyle } from "../../test/token-styles";
import { HOVER_DELAY_MS } from "../overlays/tooltip";
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

test("shows no tooltip repeating the close label it already shows", async () => {
  const screen = await render(
    <CloseButton onPress={() => {}} escapeKeycap label="Cambiar de medio" />,
  );
  const button = screen.getByRole("button", { name: "Cambiar de medio" });
  await expect.element(button).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await userEvent.tab();
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS * 2);

    expect(document.activeElement).toBe(button.element());
    expect(screen.getByRole("tooltip").elements()).toHaveLength(0);
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
});

test("writes its label in semibold detail text", async () => {
  const screen = await render(
    <CloseButton onPress={() => {}} escapeKeycap label="Cambiar de medio" />,
  );
  const label = getComputedStyle(
    screen.getByRole("button", { name: "Cambiar de medio" }).element(),
  );

  expect(label.fontSize).toBe(tokenStyle("fontSize", "text-detail"));
  expect(label.fontWeight).toBe(tokenStyle("fontWeight", "font-weight-semibold"));
});
