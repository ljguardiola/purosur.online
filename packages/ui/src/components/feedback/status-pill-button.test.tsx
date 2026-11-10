import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { StatusPill } from "./status-pill";
import { StatusPillButton, type StatusPillButtonProps } from "./status-pill-button";

const drawnProperties = [
  "display",
  "height",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "paddingLeft",
  "paddingRight",
  "borderRadius",
] as const;

test("renders as a button named by its text", async () => {
  const screen = await render(
    <main>
      <StatusPillButton tone="warning" onPress={() => {}}>
        4 avisos
      </StatusPillButton>
    </main>,
  );

  await expect.element(screen.getByRole("button", { name: "4 avisos" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("calls its action when pressed by pointer or by keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <StatusPillButton tone="warning" onPress={onPress}>
      4 avisos
    </StatusPillButton>,
  );

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("button", { name: "4 avisos" }));

  expect(onPress).toHaveBeenCalledTimes(2);
});

test("looks the same as the non-interactive pill of its tone", async () => {
  for (const tone of ["neutral", "warning", "error"] as const) {
    const pill = await render(<StatusPill tone={tone}>{`Aviso ${tone}`}</StatusPill>);
    const pillStyle = getComputedStyle(pill.getByText(`Aviso ${tone}`).element());
    const expected = drawnProperties.map((property) => pillStyle[property]);
    await pill.unmount();

    const button = await render(
      <StatusPillButton tone={tone} onPress={() => {}}>{`Aviso ${tone}`}</StatusPillButton>,
    );
    const buttonStyle = getComputedStyle(button.getByRole("button").element());

    expect(
      drawnProperties.map((property) => buttonStyle[property]),
      tone,
    ).toEqual(expected);
    await button.unmount();
  }
});

test("accepts the neutral, warning and error tones, and needs its text and action", () => {
  expectTypeOf<{
    tone: "neutral";
    children: string;
    onPress: () => void;
  }>().toExtend<StatusPillButtonProps>();
  expectTypeOf<{
    tone: "info";
    children: string;
    onPress: () => void;
  }>().not.toExtend<StatusPillButtonProps>();
  expectTypeOf<{ tone: "warning"; children: string }>().not.toExtend<StatusPillButtonProps>();
  expectTypeOf<StatusPillButtonProps>().not.toHaveProperty("className");
});
