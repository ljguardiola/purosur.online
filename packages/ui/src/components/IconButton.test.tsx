import axe from "axe-core";
import { Trash2 } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import type { ButtonIcon } from "./Button";
import { IconButton, type IconButtonProps } from "./IconButton";

test("renders at 38x38px with a white background, an 8px radius and a line border", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;

  const rect = button.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(37);
  expect(rect.width).toBeLessThan(39);
  expect(rect.height).toBeGreaterThan(37);
  expect(rect.height).toBeLessThan(39);

  const style = getComputedStyle(button);
  expect(style.borderRadius).toBe("8px");
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));

  await expectNoAccessibilityViolations(screen.container);
});

test("stays 38x38px even in a flex container too narrow to fit it, overflowing instead of shrinking", async () => {
  const screen = await render(
    <div style={{ display: "flex", width: "20px" }}>
      <IconButton aria-label="Delete row" icon={<Trash2 />} />
    </div>,
  );
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const rect = button.getBoundingClientRect();

  expect(rect.width).toBeGreaterThan(37);
  expect(rect.width).toBeLessThan(39);
  expect(rect.height).toBeGreaterThan(37);
  expect(rect.height).toBeLessThan(39);
});

test("renders the caller's glyph at 18px in strong blue", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const icon = button.querySelector("svg");

  expect(icon).not.toBeNull();
  const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);
  expect(iconRect.height).toBeGreaterThan(17);
  expect(iconRect.height).toBeLessThan(19);
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the glyph distinguishable from the button's resting background", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  const ratio = contrastRatio(
    rgbToHex(getComputedStyle(icon).color),
    rgbToHex(getComputedStyle(button).backgroundColor),
  );
  expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the glyph distinguishable from the button's hover background", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  await userEvent.hover(button);
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-bone"));

  const ratio = contrastRatio(
    rgbToHex(getComputedStyle(icon).color),
    rgbToHex(getComputedStyle(button).backgroundColor),
  );
  expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  await expectNoAccessibilityViolations(screen.container);
});

test("turns the background bone and the border soft blue on hover, keeping the glyph's color", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-bone"));
  await expect.poll(() => getComputedStyle(button).borderColor).toBe(tokenRgb("blue-soft"));

  const icon = button.querySelector("svg");
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the same 3px strong-blue focus outline as every other button", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const focusRingColor = tokenRgb("brand-blue-strong");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(focusRingColor);
  await expectNoAccessibilityViolations(screen.container);
});

test("activates on Enter when focused via keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <IconButton aria-label="Delete row" icon={<Trash2 />} onPress={onPress} />,
  );

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("dims to the design's 45% opacity when disabled", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} isDisabled />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Delete row" })).toBeDisabled();
  expect(getComputedStyle(button).opacity).toBe("0.45");
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an icon button without an accessible name", () => {
  expectTypeOf<{ icon: ButtonIcon }>().not.toExtend<IconButtonProps>();
});

test("takes its accessible name from a visible label referenced with aria-labelledby", async () => {
  const screen = await render(
    <>
      <span id="delete-row-label">Delete row</span>
      <IconButton aria-labelledby="delete-row-label" icon={<Trash2 />} />
    </>,
  );

  await expect.element(screen.getByRole("button", { name: "Delete row" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("an empty aria-label from a variable leaves the button nameless, and the accessibility check catches it", async () => {
  const label: string = "";
  const screen = await render(<IconButton aria-label={label} icon={<Trash2 />} />);

  const results = await axe.run(screen.container);
  expect(results.violations.map((violation) => violation.id)).toEqual(["button-name"]);
});
