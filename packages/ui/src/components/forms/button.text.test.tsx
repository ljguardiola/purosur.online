import { ArrowLeft } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import { Button, type ButtonProps } from "./button";

type ButtonPropsWithoutText = ButtonProps extends infer P
  ? P extends unknown
    ? Omit<P, "children">
    : never
  : never;

function textNodeRect(node: ChildNode): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect();
}

test("renders the plain text form in the accent text color with no background and no border", async () => {
  const screen = await render(<Button variant="text">Volver</Button>);
  const button = screen.getByRole("button", { name: "Volver" }).element() as HTMLElement;
  const style = getComputedStyle(button);

  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderLeftWidth).toBe("0px");
  expect(style.color).toBe(tokenRgb("text-accent"));
});

test("sizes the plain text form like the destructive one, at both drawn sizes", async () => {
  for (const size of ["small", "large"] as const) {
    const screen = await render(
      <>
        <Button variant="text" size={size}>{`Volver ${size}`}</Button>
        <Button variant="text" destructive size={size}>{`Cancelar ${size}`}</Button>
      </>,
    );
    const plain = getComputedStyle(
      screen.getByRole("button", { name: `Volver ${size}` }).element() as HTMLElement,
    );
    const destructive = getComputedStyle(
      screen.getByRole("button", { name: `Cancelar ${size}` }).element() as HTMLElement,
    );

    for (const property of [
      "height",
      "fontSize",
      "fontWeight",
      "paddingLeft",
      "paddingRight",
      "borderRadius",
      "columnGap",
    ] as const) {
      expect(plain[property], `${size} ${property}`).toBe(destructive[property]);
    }
  }
});

test("carries no icon when it is given none", async () => {
  const screen = await render(<Button variant="text">Volver</Button>);
  const button = screen.getByRole("button", { name: "Volver" }).element() as HTMLElement;

  expect(button.querySelector("svg")).toBeNull();
});

test("places a caller's 18px icon before the label, with an 8px gap, painted in the label's color", async () => {
  const screen = await render(
    <Button variant="text" icon={<ArrowLeft />}>
      Volver
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Volver" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;
  const labelWrapper = button.lastChild as HTMLElement;

  expect((button.firstChild as HTMLElement).contains(icon)).toBe(true);
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);
  expect(getComputedStyle(icon).stroke).toBe(tokenRgb("text-accent"));

  const gap = textNodeRect(labelWrapper.firstChild as ChildNode).left - iconRect.right;
  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);
});

test("turns the plain text form's background bone on hover, keeping its label readable", async () => {
  const screen = await render(<Button variant="text">Volver</Button>);
  const button = screen.getByRole("button", { name: "Volver" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));

  const hovered = getComputedStyle(button);
  expect(hovered.color).toBe(tokenRgb("text-accent"));
  expect(
    contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the plain text form's label and icon readable on the surfaces it sits on", async () => {
  for (const surface of ["surface", "surface-subtle"] as const) {
    const screen = await render(
      <div style={{ backgroundColor: tokenRgb(surface) }}>
        <Button variant="text" icon={<ArrowLeft />}>
          {`Volver sobre ${surface}`}
        </Button>
      </div>,
    );
    const button = screen
      .getByRole("button", { name: `Volver sobre ${surface}` })
      .element() as HTMLElement;
    const icon = button.querySelector("svg") as SVGSVGElement;
    const behind = rgbToHex(tokenRgb(surface));

    expect(
      contrastRatio(rgbToHex(getComputedStyle(button).color), behind),
      `${surface} label`,
    ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    expect(
      contrastRatio(rgbToHex(getComputedStyle(icon).stroke), behind),
      `${surface} icon`,
    ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    await expectNoAccessibilityViolations(screen.container);
  }
});

test("shows the shared focus outline on the plain text form and activates it by keyboard and by pointer", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <Button variant="text" icon={<ArrowLeft />} onPress={onPress}>
      Volver
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Volver" }).element() as HTMLElement;

  await userEvent.tab();
  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(tokenRgb("focus"));

  await userEvent.keyboard("{Enter}");
  await userEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("accepts the plain text form with or without a caller's icon, at both drawn sizes", () => {
  expectTypeOf<{ variant: "text" }>().toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{ variant: "text"; destructive: false }>().toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{ variant: "text"; icon: Icon }>().toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{ variant: "text"; icon: Icon; size: "large" }>().toExtend<ButtonPropsWithoutText>();
});

test("does not accept the plain text form at a size the design never draws it", () => {
  expectTypeOf<{ variant: "text"; size: "medium" }>().not.toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{ variant: "text"; size: "sale" }>().not.toExtend<ButtonPropsWithoutText>();
});
