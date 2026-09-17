import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, hexToRgb } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { Button } from "./Button";

// Converts a "#rrggbb" token value to the "rgb(r, g, b)" form a browser reports from getComputedStyle.
function hexTokenToRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

// Converts a "rgb(r, g, b)" computed style value back to "#rrggbb" for contrastRatio().
function rgbToHex(rgb: string): string {
  const channels = rgb.match(/\d+/g);
  if (channels?.length !== 3) {
    throw new Error(`Not an opaque rgb() color: ${rgb}`);
  }
  return `#${channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
}

// Reads a "--color-<name>" custom property from the compiled stylesheet, so expectations are
// derived from the same token source design.pen and tokens.css agree on, never hardcoded.
function tokenRgb(name: string): string {
  return hexTokenToRgb(
    getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim(),
  );
}

// Renders a Button with the given label and props, returning its computed style.
async function buttonStyle(
  label: string,
  props: Partial<Omit<Parameters<typeof Button>[0], "children">> = {},
): Promise<CSSStyleDeclaration> {
  const screen = await render(<Button {...props}>{label}</Button>);
  return getComputedStyle(screen.getByRole("button", { name: label }).element() as HTMLElement);
}

test("renders the text provided by the caller", async () => {
  const screen = await render(<Button>Save</Button>);

  await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("activates on Enter when focused via keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(<Button onPress={onPress}>Save</Button>);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("activates on Space when focused via keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(<Button onPress={onPress}>Save</Button>);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(onPress).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a visible focus outline in strong blue when reached by keyboard", async () => {
  const screen = await render(<Button>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" }).element() as HTMLElement;
  const focusRingColor = tokenRgb("brand-blue-strong");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("2px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(focusRingColor);
  await expectNoAccessibilityViolations(screen.container);
});

test("hides the focus outline when focused by a pointer click", async () => {
  const screen = await render(<Button>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" }).element() as HTMLElement;

  await userEvent.click(button);

  expect(document.activeElement).toBe(button);
  await expect.poll(() => button.hasAttribute("data-focus-visible")).toBe(false);
  expect(getComputedStyle(button).outlineStyle).toBe("none");
  await expectNoAccessibilityViolations(screen.container);
});

test("a disabled button cannot be activated", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <Button onPress={onPress} isDisabled>
      Save
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save" });

  await expect.element(button).toBeDisabled();

  await userEvent.tab();
  expect(document.activeElement).not.toBe(button.element());

  await button.click({ force: true });

  expect(onPress).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(screen.container);
});

test("renders the secondary variant with a transparent background, earth-toned border and ink text", async () => {
  const screen = await render(<Button variant="secondary">Cancel</Button>);
  const button = screen.getByRole("button", { name: "Cancel" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(button).borderWidth).toBe("1px");
  expect(getComputedStyle(button).borderColor).toBe(tokenRgb("brand-earth-ui"));
  expect(getComputedStyle(button).color).toBe(tokenRgb("ink"));
  await expectNoAccessibilityViolations(screen.container);
});

test("sizes the primary and secondary variants to the design's fixed heights", async () => {
  const primary = await buttonStyle("Primary");
  const secondary = await buttonStyle("Secondary", { variant: "secondary" });

  expect(primary.height).toBe("72px");
  expect(secondary.height).toBe("40px");
});

test("gives the primary and secondary variants their own corner radius", async () => {
  const primary = await buttonStyle("Primary");
  const secondary = await buttonStyle("Secondary", { variant: "secondary" });

  expect(primary.borderRadius).toBe("8px");
  expect(secondary.borderRadius).toBe("6px");
});

test("renders bold text on both variants", async () => {
  const primary = await buttonStyle("Primary");
  const secondary = await buttonStyle("Secondary", { variant: "secondary" });

  expect(primary.fontWeight).toBe("700");
  expect(secondary.fontWeight).toBe("700");
});

test("dims a disabled button to the design's 45% opacity, on both variants", async () => {
  const primary = await buttonStyle("Primary", { isDisabled: true });
  const secondary = await buttonStyle("Secondary", { variant: "secondary", isDisabled: true });

  expect(primary.opacity).toBe("0.45");
  expect(secondary.opacity).toBe("0.45");
});

test("keeps the primary variant's base text readable against its background", async () => {
  const primary = await buttonStyle("Primary");

  const ratio = contrastRatio(rgbToHex(primary.color), rgbToHex(primary.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the primary variant's hover text readable against its background", async () => {
  const screen = await render(<Button>Primary</Button>);
  const button = screen.getByRole("button", { name: "Primary" }).element() as HTMLElement;

  await userEvent.hover(button);
  // The base and hover backgrounds are both fully opaque, so a mid-fade color is also a plain
  // "rgb(...)" string: wait for the exact designed hover token instead of just any opaque color.
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("brand-blue-strong"));

  const hovered = getComputedStyle(button);
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the secondary variant's hover text readable against its background", async () => {
  const screen = await render(<Button variant="secondary">Cancel</Button>);
  const button = screen.getByRole("button", { name: "Cancel" }).element() as HTMLElement;

  await userEvent.hover(button);
  // See the primary hover test above: wait for the exact designed token, not just any opaque color.
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-bone"));

  const hovered = getComputedStyle(button);
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});
