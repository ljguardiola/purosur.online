import { RotateCw } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import { Pill } from "./pill";
import { PillButton, type PillButtonProps } from "./pill-button";

const drawnProperties = [
  "display",
  "alignItems",
  "height",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "paddingLeft",
  "paddingRight",
  "borderRadius",
  "columnGap",
] as const;

test("renders as a button named by its text, with its icon hidden from assistive technology", async () => {
  const screen = await render(
    <main>
      <PillButton tone="error" icon={<RotateCw />} onPress={() => {}}>
        No se cargaron las alertas
      </PillButton>
    </main>,
  );

  const button = screen
    .getByRole("button", { name: "No se cargaron las alertas" })
    .element() as HTMLElement;
  expect(button.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test("takes an accessible name of the caller's that says what pressing it does", async () => {
  const screen = await render(
    <main>
      <PillButton
        tone="error"
        icon={<RotateCw />}
        aria-label="No se cargaron las alertas. Reintentar"
        onPress={() => {}}
      >
        No se cargaron las alertas
      </PillButton>
    </main>,
  );

  await expect
    .element(screen.getByRole("button", { name: "No se cargaron las alertas. Reintentar" }))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("calls its action when pressed by pointer or by keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <PillButton tone="error" icon={<RotateCw />} onPress={onPress}>
      No se cargaron las alertas
    </PillButton>,
  );

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledTimes(2);
});

test("draws like the plain pill of its tone", async () => {
  for (const tone of ["warning", "error"] as const) {
    const screen = await render(
      <>
        <Pill tone={tone} icon={<RotateCw />}>{`Pill ${tone}`}</Pill>
        <PillButton tone={tone} icon={<RotateCw />} onPress={() => {}}>
          {`Botón ${tone}`}
        </PillButton>
      </>,
    );
    const pill = screen.getByText(`Pill ${tone}`).element() as HTMLElement;
    const button = screen.getByRole("button", { name: `Botón ${tone}` }).element() as HTMLElement;

    for (const property of drawnProperties) {
      expect(getComputedStyle(button)[property], `${tone} ${property}`).toBe(
        getComputedStyle(pill)[property],
      );
    }
  }
});

test("rings itself in its tone's soft color on hover", async () => {
  const screen = await render(
    <PillButton tone="error" icon={<RotateCw />} onPress={() => {}}>
      No se cargaron las alertas
    </PillButton>,
  );
  const button = screen.getByRole("button").element() as HTMLElement;
  expect(getComputedStyle(button).boxShadow).not.toContain(tokenRgb("error-soft"));

  await userEvent.hover(button);

  await expect
    .poll(() => getComputedStyle(button).boxShadow)
    .toContain(`${tokenRgb("error-soft")} 0px 0px 0px 1px`);
});

test("shows the shared tight focus outline when reached by keyboard", async () => {
  const screen = await render(
    <PillButton tone="error" icon={<RotateCw />} onPress={() => {}}>
      No se cargaron las alertas
    </PillButton>,
  );
  const button = screen.getByRole("button").element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(button);
  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("2px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(tokenRgb("focus"));
});

test("needs its text and its action", () => {
  expectTypeOf<{
    tone: "error";
    icon: Icon;
    children: string;
  }>().not.toExtend<PillButtonProps>();
  expectTypeOf<{
    tone: "error";
    icon: Icon;
    onPress: () => void;
  }>().not.toExtend<PillButtonProps>();
  expectTypeOf<PillButtonProps>().not.toHaveProperty("className");
});
