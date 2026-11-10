import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import { expect, expectTypeOf, test } from "vitest";
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
      <StatusPillButton tone="warning">4 avisos</StatusPillButton>
    </main>,
  );

  await expect.element(screen.getByRole("button", { name: "4 avisos" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("opens what the trigger it sits in opens, by pointer or by keyboard", async () => {
  const screen = await render(
    <DialogTrigger>
      <StatusPillButton tone="warning">4 avisos</StatusPillButton>
      <Popover>
        <Dialog aria-label="Avisos de esta caja">Detalle</Dialog>
      </Popover>
    </DialogTrigger>,
  );

  await userEvent.click(screen.getByRole("button", { name: "4 avisos" }));
  await expect.element(screen.getByRole("dialog", { name: "Avisos de esta caja" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();

  screen.getByRole("button", { name: "4 avisos" }).element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("dialog", { name: "Avisos de esta caja" })).toBeVisible();
});

test("looks the same as the non-interactive pill of its tone", async () => {
  for (const tone of ["neutral", "warning", "error"] as const) {
    const pill = await render(<StatusPill tone={tone}>{`Aviso ${tone}`}</StatusPill>);
    const pillStyle = getComputedStyle(pill.getByText(`Aviso ${tone}`).element());
    const expected = drawnProperties.map((property) => pillStyle[property]);
    await pill.unmount();

    const button = await render(<StatusPillButton tone={tone}>{`Aviso ${tone}`}</StatusPillButton>);
    const buttonStyle = getComputedStyle(button.getByRole("button").element());

    expect(
      drawnProperties.map((property) => buttonStyle[property]),
      tone,
    ).toEqual(expected);
    await button.unmount();
  }
});

test("accepts the neutral, warning and error tones, and needs its text but no action of its own", () => {
  expectTypeOf<{ tone: "neutral"; children: string }>().toExtend<StatusPillButtonProps>();
  expectTypeOf<{ tone: "info"; children: string }>().not.toExtend<StatusPillButtonProps>();
  expectTypeOf<{ tone: "warning" }>().not.toExtend<StatusPillButtonProps>();
  expectTypeOf<StatusPillButtonProps>().not.toHaveProperty("onPress");
  expectTypeOf<StatusPillButtonProps>().not.toHaveProperty("className");
});
