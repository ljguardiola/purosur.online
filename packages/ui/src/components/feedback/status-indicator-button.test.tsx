import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { tokenRgb } from "../../test/token-colors";
import { StatusIndicator } from "./status-indicator";
import { StatusIndicatorButton, type StatusIndicatorButtonProps } from "./status-indicator-button";

test("is a button that reads as its caller's text", async () => {
  const screen = await render(
    <StatusIndicatorButton tone="warning">2 avisos</StatusIndicatorButton>,
  );

  await expect.element(screen.getByRole("button", { name: "2 avisos" })).toBeVisible();
});

test("calls onPress when pressed", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <StatusIndicatorButton tone="warning" onPress={onPress}>
      1 aviso
    </StatusIndicatorButton>,
  );

  await userEvent.click(screen.getByRole("button", { name: "1 aviso" }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("looks exactly like a status indicator of the same tone", async () => {
  const screen = await render(
    <>
      <StatusIndicator tone="error">Igual</StatusIndicator>
      <StatusIndicatorButton tone="error">Igual</StatusIndicatorButton>
    </>,
  );
  const indicator = screen.getByText("Igual").first().element() as HTMLElement;
  const button = screen.getByRole("button").element() as HTMLElement;
  const expected = getComputedStyle(indicator);
  const actual = getComputedStyle(button);

  for (const property of [
    "height",
    "paddingLeft",
    "paddingRight",
    "gap",
    "fontSize",
    "fontWeight",
    "backgroundColor",
    "color",
    "display",
    "alignItems",
  ] as const) {
    expect(actual[property], property).toBe(expected[property]);
  }
  expectFullyRound(button);
  expect(getComputedStyle(button.firstElementChild as HTMLElement).backgroundColor).toBe(
    tokenRgb("error-soft"),
  );
});

test("has no accessibility violations", async () => {
  const screen = await render(
    <StatusIndicatorButton tone="warning">1 aviso</StatusIndicatorButton>,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a status indicator button without text", () => {
  expectTypeOf<{ tone: "warning" }>().not.toExtend<StatusIndicatorButtonProps>();
});
