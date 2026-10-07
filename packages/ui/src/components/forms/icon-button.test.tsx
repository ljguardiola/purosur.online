import axe from "axe-core";
import { Trash2 } from "lucide-react";
import { useId } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { DispatchableCdpSession } from "../../test/setup-browser";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import { IconButton, type IconButtonProps } from "./icon-button";

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
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("border"));
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
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("text-accent"));
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
});

test("keeps the glyph distinguishable from the button's hover background", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  await userEvent.hover(button);
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));

  const ratio = contrastRatio(
    rgbToHex(getComputedStyle(icon).color),
    rgbToHex(getComputedStyle(button).backgroundColor),
  );
  expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
});

test("turns the background bone and the border soft blue on hover, keeping the glyph's color", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
  await expect.poll(() => getComputedStyle(button).borderColor).toBe(tokenRgb("action-soft"));

  const icon = button.querySelector("svg");
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("text-accent"));
});

test("shows the same 3px strong-blue focus outline as every other button", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;
  const focusRingColor = tokenRgb("focus");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(focusRingColor);
});

test("activates on Enter when focused via keyboard", async () => {
  const onPress = vi.fn();
  await render(<IconButton aria-label="Delete row" icon={<Trash2 />} onPress={onPress} />);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
});

test("dims to the design's 45% opacity when disabled", async () => {
  const screen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} disabled />);
  const button = screen.getByRole("button", { name: "Delete row" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Delete row" })).toBeDisabled();
  expect(getComputedStyle(button).opacity).toBe("0.45");
});

test("shows the hand cursor when enabled and the arrow cursor when disabled", async () => {
  const enabledScreen = await render(<IconButton aria-label="Delete row" icon={<Trash2 />} />);
  const enabledButton = enabledScreen
    .getByRole("button", { name: "Delete row" })
    .element() as HTMLElement;
  expect(getComputedStyle(enabledButton).cursor).toBe("pointer");
  await enabledScreen.unmount();

  const disabledScreen = await render(
    <IconButton aria-label="Delete row" icon={<Trash2 />} disabled />,
  );
  const disabledButton = disabledScreen
    .getByRole("button", { name: "Delete row" })
    .element() as HTMLElement;
  expect(getComputedStyle(disabledButton).cursor).toBe("default");
});

test("does not accept an icon button without an accessible name", () => {
  expectTypeOf<{ icon: Icon }>().not.toExtend<IconButtonProps>();
});

function IconButtonWithExternalLabel({ icon }: { icon: Icon }) {
  const labelId = useId();
  return (
    <>
      <span id={labelId}>Delete row</span>
      <IconButton aria-labelledby={labelId} icon={icon} />
    </>
  );
}

test("takes its accessible name from a visible label referenced with aria-labelledby", async () => {
  const screen = await render(<IconButtonWithExternalLabel icon={<Trash2 />} />);

  await expect.element(screen.getByRole("button", { name: "Delete row" })).toBeVisible();
});

test("an empty aria-label from a variable leaves the button nameless, and the accessibility check catches it", async () => {
  const label: string = "";
  const screen = await render(<IconButton aria-label={label} icon={<Trash2 />} />);

  const results = await axe.run(screen.container);
  expect(results.violations.map((violation) => violation.id)).toEqual(["button-name"]);
});

test("names its disabled state disabled", () => {
  expectTypeOf<IconButtonProps>().toHaveProperty("disabled");
  expectTypeOf<IconButtonProps>().not.toHaveProperty("isDisabled");
});

test("offers a bordered and a subtle look, bordered unless asked", async () => {
  expectTypeOf<IconButtonProps["variant"]>().toEqualTypeOf<"bordered" | "subtle" | undefined>();

  const screen = await render(
    <>
      <IconButton aria-label="Unset" icon={<Trash2 />} />
      <IconButton variant="bordered" aria-label="Bordered" icon={<Trash2 />} />
    </>,
  );
  const unset = screen.getByRole("button", { name: "Unset" }).element() as HTMLElement;
  const bordered = screen.getByRole("button", { name: "Bordered" }).element() as HTMLElement;
  expect(unset.className).toBe(bordered.className);
});

test("draws the subtle look as a 32x32px square with 6px corners and no border or fill of its own", async () => {
  const screen = await render(
    <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} />,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;

  const rect = button.getBoundingClientRect();
  expect(rect.width).toBe(32);
  expect(rect.height).toBe(32);

  const style = getComputedStyle(button);
  expect(style.borderRadius).toBe("6px");
  expect(style.borderWidth).toBe("0px");
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("renders the subtle look's glyph at 18px in the secondary tone", async () => {
  const screen = await render(
    <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} />,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBe(18);
  expect(iconRect.height).toBe(18);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-subtle"));
});

test("keeps the subtle look's glyph distinguishable from the grey surface it sits on", async () => {
  const screen = await render(
    <div style={{ backgroundColor: "var(--color-surface-subtle)" }}>
      <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} />
    </div>,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;
  const surface = button.parentElement as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  const ratio = contrastRatio(
    rgbToHex(getComputedStyle(icon).color),
    rgbToHex(getComputedStyle(surface).backgroundColor),
  );
  expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
});

test("fills the subtle look with sand and turns its glyph strong blue on hover, still borderless", async () => {
  const screen = await render(
    <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} />,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;
  const icon = button.querySelector("svg") as SVGSVGElement;

  await userEvent.hover(button);

  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-soft"));
  await expect.poll(() => getComputedStyle(icon).color).toBe(tokenRgb("text-accent"));
  expect(getComputedStyle(button).borderWidth).toBe("0px");
  expect(
    contrastRatio(
      rgbToHex(getComputedStyle(icon).color),
      rgbToHex(getComputedStyle(button).backgroundColor),
    ),
  ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
});

test("shows the subtle look's focus at once with the same 3px strong-blue outline as every other button", async () => {
  const screen = await render(
    <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} />,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  expect(getComputedStyle(button).outlineOffset).toBe("3px");
  expect(getComputedStyle(button).outlineColor).toBe(tokenRgb("focus"));
});

test("dims the subtle look to the same 45% opacity when disabled", async () => {
  const screen = await render(
    <IconButton variant="subtle" aria-label="Remove code" icon={<Trash2 />} disabled />,
  );
  const button = screen.getByRole("button", { name: "Remove code" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Remove code" })).toBeDisabled();
  expect(getComputedStyle(button).opacity).toBe("0.45");
  expect(getComputedStyle(button).cursor).toBe("default");
});

const lockedReason = "La venta ya no se puede cambiar porque tiene un pago aprobado.";

async function renderLocked(onPress = vi.fn()) {
  await page.viewport(1280, 900);
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  window.focus();
  const screen = await render(
    <IconButton
      aria-label="Remove row"
      icon={<Trash2 />}
      disabledReason={lockedReason}
      onPress={onPress}
    />,
  );
  return { screen, button: screen.getByRole("button", { name: "Remove row" }) };
}

test("is announced disabled and dimmed, and ignores a press, when given the reason it is disabled", async () => {
  const onPress = vi.fn();
  const { button } = await renderLocked(onPress);

  button.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  await expect.element(button).toHaveAttribute("aria-disabled", "true");
  expect(getComputedStyle(button.element()).opacity).toBe("0.45");
  expect(getComputedStyle(button.element()).cursor).toBe("default");
  expect(onPress).not.toHaveBeenCalled();
});

test("opens the reason it is disabled as a tooltip when hovered", async () => {
  const { screen, button } = await renderLocked();

  await userEvent.hover(button);

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(lockedReason);
});

test("opens the reason it is disabled as a tooltip when reached by keyboard", async () => {
  const { screen, button } = await renderLocked();

  await userEvent.tab();

  expect(document.activeElement).toBe(button.element());
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(lockedReason);
});

test("has no accessibility violations with the reason it is disabled, closed or open", async () => {
  const { screen } = await renderLocked();
  await expectNoAccessibilityViolations(screen.container);

  await userEvent.tab();
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("takes the reason it is disabled instead of being told it is disabled", () => {
  expectTypeOf<{
    "aria-label": string;
    icon: Icon;
    disabledReason: string;
  }>().toExtend<IconButtonProps>();
  expectTypeOf<{
    "aria-label": string;
    icon: Icon;
    disabled: boolean;
    disabledReason: string;
  }>().not.toExtend<IconButtonProps>();
});
