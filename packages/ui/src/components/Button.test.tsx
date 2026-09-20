import axe from "axe-core";
import { Check, X } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import { Button, type ButtonIcon, type ButtonProps, type ButtonSize } from "./Button";

const sizes: ButtonSize[] = ["small", "medium", "large", "sale"];

// The helper supplies the text itself, so its props leave out `children`. The Omit distributes
// over ButtonProps' variant union: a plain Omit on a union collapses it and would stop checking
// that a secondary button can't take a destructive tone.
type ButtonPropsWithoutText = ButtonProps extends infer P
  ? P extends unknown
    ? Omit<P, "children">
    : never
  : never;

async function buttonStyle(
  label: string,
  props: ButtonPropsWithoutText = {},
): Promise<CSSStyleDeclaration> {
  const screen = await render(<Button {...props}>{label}</Button>);
  return getComputedStyle(screen.getByRole("button", { name: label }).element() as HTMLElement);
}

// Returns the bounding rect of a plain text child node, so a gap can be measured against an
// adjacent icon without relying on a wrapping element that doesn't exist in the rendered markup.
function textNodeRect(node: ChildNode): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect();
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
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
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

test("defaults to the medium size when none is given", async () => {
  const primary = await buttonStyle("Default primary");
  const secondary = await buttonStyle("Default secondary", { variant: "secondary" });

  expect(primary.height).toBe("48px");
  expect(primary.fontSize).toBe("16px");
  expect(secondary.height).toBe("48px");
  expect(secondary.fontSize).toBe("16px");
});

test("renders every size in the design's height and text-size scale, shared by both variants", async () => {
  const expectations: Record<ButtonSize, { height: string; fontSize: string }> = {
    small: { height: "40px", fontSize: "16px" },
    medium: { height: "48px", fontSize: "16px" },
    large: { height: "56px", fontSize: "18px" },
    sale: { height: "72px", fontSize: "24px" },
  };

  for (const size of sizes) {
    const { height, fontSize } = expectations[size];
    const primary = await buttonStyle(`Primary ${size}`, { size });
    const secondary = await buttonStyle(`Secondary ${size}`, { variant: "secondary", size });

    expect(primary.height, `primary ${size} height`).toBe(height);
    expect(primary.fontSize, `primary ${size} font size`).toBe(fontSize);
    expect(secondary.height, `secondary ${size} height`).toBe(height);
    expect(secondary.fontSize, `secondary ${size} font size`).toBe(fontSize);
  }
});

test("keeps 16px horizontal padding and no vertical padding on every size", async () => {
  for (const size of sizes) {
    const style = await buttonStyle(`Padded ${size}`, { size });

    expect(style.paddingLeft, `${size} padding-left`).toBe("16px");
    expect(style.paddingRight, `${size} padding-right`).toBe("16px");
    expect(style.paddingTop, `${size} padding-top`).toBe("0px");
    expect(style.paddingBottom, `${size} padding-bottom`).toBe("0px");
  }
});

test("centers its content regardless of size", async () => {
  const style = await buttonStyle("Centered");

  expect(style.display).toBe("inline-flex");
  expect(style.alignItems).toBe("center");
  expect(style.justifyContent).toBe("center");
});

test("has no minimum width, so a short label renders narrower than a long one", async () => {
  const short = await buttonStyle("Ok");
  const long = await buttonStyle("Complete the sale and print the receipt");

  expect(Number.parseFloat(short.width)).toBeLessThan(Number.parseFloat(long.width));
});

test("keeps the secondary variant's border from changing its height in any size", async () => {
  for (const size of sizes) {
    const primary = await buttonStyle(`Primary height ${size}`, { size });
    const secondary = await buttonStyle(`Secondary height ${size}`, { variant: "secondary", size });

    expect(secondary.height, `${size} height with border`).toBe(primary.height);
  }
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
  const primaryWithIcon = await buttonStyle("Primary icon", { icon: <Check />, isDisabled: true });

  expect(primary.opacity).toBe("0.45");
  expect(secondary.opacity).toBe("0.45");
  expect(primaryWithIcon.opacity).toBe("0.45");
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

test("renders the destructive tone of the primary button with an error background and white text", async () => {
  const screen = await render(<Button tone="destructive">Void sale</Button>);
  const button = screen.getByRole("button", { name: "Void sale" }).element() as HTMLElement;

  expect(getComputedStyle(button).backgroundColor).toBe(tokenRgb("status-error-ui"));
  expect(getComputedStyle(button).color).toBe(tokenRgb("surface-white"));
  await expectNoAccessibilityViolations(screen.container);
});

test("turns the destructive tone's hover background to error-strong, keeping white text readable", async () => {
  const screen = await render(<Button tone="destructive">Void sale</Button>);
  const button = screen.getByRole("button", { name: "Void sale" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("status-error-strong"));

  const hovered = getComputedStyle(button);
  expect(hovered.color).toBe(tokenRgb("surface-white"));
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the same focus outline on the destructive tone as on every other tone", async () => {
  const screen = await render(<Button tone="destructive">Void sale</Button>);
  const button = screen.getByRole("button", { name: "Void sale" }).element() as HTMLElement;
  const focusRingColor = tokenRgb("brand-blue-strong");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(focusRingColor);
  await expectNoAccessibilityViolations(screen.container);
});

test("places the primary variant's 24px icon after the text with its 12px gap", async () => {
  const screen = await render(<Button icon={<Check />}>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" }).element() as HTMLElement;
  const icon = button.querySelector("svg");
  const iconWrapper = button.lastChild as HTMLElement;

  expect(icon).not.toBeNull();
  expect(button.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(button.firstChild?.textContent).toBe("Save");
  expect(iconWrapper.contains(icon)).toBe(true);

  const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(23);
  expect(iconRect.width).toBeLessThan(25);
  expect(iconRect.height).toBeGreaterThan(23);
  expect(iconRect.height).toBeLessThan(25);
  // The icon has no fill of its own, so it renders in the button's own (white) text color.
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("surface-white"));

  const textRect = textNodeRect(button.firstChild as ChildNode);
  const gap = iconRect.left - textRect.right;
  expect(gap).toBeGreaterThan(11);
  expect(gap).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("places the secondary variant's 18px icon before the text with its 8px gap", async () => {
  const screen = await render(
    <Button variant="secondary" icon={<X />}>
      Cancel
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel" }).element() as HTMLElement;
  const icon = button.querySelector("svg");
  const iconWrapper = button.firstChild as HTMLElement;

  expect(icon).not.toBeNull();
  expect(iconWrapper.contains(icon)).toBe(true);
  expect(button.lastChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(button.lastChild?.textContent).toBe("Cancel");

  const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);
  expect(iconRect.height).toBeGreaterThan(17);
  expect(iconRect.height).toBeLessThan(19);
  // The icon has no fill of its own, so it renders in the button's own (ink) text color.
  expect(getComputedStyle(icon as SVGSVGElement).color).toBe(tokenRgb("ink"));

  const textRect = textNodeRect(button.lastChild as ChildNode);
  const gap = textRect.left - iconRect.right;
  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a plain svg icon (no size prop of its own) at 24px in the primary variant and 18px in the secondary", async () => {
  const plainIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );

  const primary = await render(<Button icon={plainIcon}>Save</Button>);
  const primaryRect = (
    primary.getByRole("button", { name: "Save" }).element().querySelector("svg") as SVGSVGElement
  ).getBoundingClientRect();
  expect(primaryRect.width).toBeGreaterThan(23);
  expect(primaryRect.width).toBeLessThan(25);

  const secondary = await render(
    <Button variant="secondary" icon={plainIcon}>
      Cancel
    </Button>,
  );
  const secondaryRect = (
    secondary
      .getByRole("button", { name: "Cancel" })
      .element()
      .querySelector("svg") as SVGSVGElement
  ).getBoundingClientRect();
  expect(secondaryRect.width).toBeGreaterThan(17);
  expect(secondaryRect.width).toBeLessThan(19);
});

test("keeps the icon size fixed per variant across every button size", async () => {
  for (const size of sizes) {
    const primary = await render(
      <Button icon={<Check />} size={size}>{`Primary icon ${size}`}</Button>,
    );
    const primaryIcon = primary
      .getByRole("button", { name: `Primary icon ${size}` })
      .element()
      .querySelector("svg") as SVGSVGElement;
    const primaryRect = primaryIcon.getBoundingClientRect();
    expect(primaryRect.width, `primary ${size} icon width`).toBeGreaterThan(23);
    expect(primaryRect.width, `primary ${size} icon width`).toBeLessThan(25);

    const secondary = await render(
      <Button variant="secondary" icon={<X />} size={size}>{`Secondary icon ${size}`}</Button>,
    );
    const secondaryIcon = secondary
      .getByRole("button", { name: `Secondary icon ${size}` })
      .element()
      .querySelector("svg") as SVGSVGElement;
    const secondaryRect = secondaryIcon.getBoundingClientRect();
    expect(secondaryRect.width, `secondary ${size} icon width`).toBeGreaterThan(17);
    expect(secondaryRect.width, `secondary ${size} icon width`).toBeLessThan(19);
  }
});

test("does not accept a button without text, since it would have no accessible name", () => {
  expectTypeOf<{ icon: ButtonIcon }>().not.toExtend<ButtonProps>();
});

test("does not accept a destructive tone on the secondary variant", () => {
  expectTypeOf<{
    variant: "secondary";
    tone: "destructive";
  }>().not.toExtend<ButtonPropsWithoutText>();
});

test("an empty label from a variable leaves the button nameless, and the accessibility check catches it", async () => {
  const label: string = "";
  const screen = await render(<Button>{label}</Button>);

  const results = await axe.run(screen.container);
  expect(results.violations.map((violation) => violation.id)).toEqual(["button-name"]);
});

test("renders the text-only destructive form with no background and no border", async () => {
  const screen = await render(
    <Button variant="text" tone="destructive">
      Cancel sale
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Cancel sale" })).toBeVisible();
  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(button).borderTopWidth).toBe("0px");
  expect(getComputedStyle(button).borderBottomWidth).toBe("0px");
  expect(getComputedStyle(button).borderLeftWidth).toBe("0px");
  expect(getComputedStyle(button).borderRightWidth).toBe("0px");
  expect(getComputedStyle(button).color).toBe(tokenRgb("status-error-ui"));
  await expectNoAccessibilityViolations(screen.container);
});

test("sizes the text-only destructive form at 40px with a 16px semibold label by default", async () => {
  const style = await buttonStyle("Cancel sale", { variant: "text", tone: "destructive" });

  expect(style.height).toBe("40px");
  expect(style.fontSize).toBe("16px");
  expect(style.fontWeight).toBe("600");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.paddingTop).toBe("0px");
  expect(style.paddingBottom).toBe("0px");
});

test("sizes the text-only destructive form at 56px with an 18px label at its larger drawn size", async () => {
  const style = await buttonStyle("Cancel", {
    variant: "text",
    tone: "destructive",
    size: "large",
  });

  expect(style.height).toBe("56px");
  expect(style.fontSize).toBe("18px");
  expect(style.fontWeight).toBe("600");
});

test("carries its own 18px x icon before the label, with an 8px gap, on both drawn sizes", async () => {
  for (const size of ["small", "large"] as const) {
    const screen = await render(
      <Button variant="text" tone="destructive" size={size}>
        {`Cancel sale ${size}`}
      </Button>,
    );
    const button = screen
      .getByRole("button", { name: `Cancel sale ${size}` })
      .element() as HTMLElement;
    const icon = button.querySelector("svg");
    const iconWrapper = button.firstChild as HTMLElement;

    expect(icon, `${size} icon`).not.toBeNull();
    expect(iconWrapper.contains(icon), `${size} icon wrapper`).toBe(true);
    expect(button.lastChild?.nodeType, `${size} label node`).toBe(Node.TEXT_NODE);
    expect(button.lastChild?.textContent, `${size} label`).toBe(`Cancel sale ${size}`);

    const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
    expect(iconRect.width, `${size} icon width`).toBeGreaterThan(17);
    expect(iconRect.width, `${size} icon width`).toBeLessThan(19);
    expect(iconRect.height, `${size} icon height`).toBeGreaterThan(17);
    expect(iconRect.height, `${size} icon height`).toBeLessThan(19);
    expect(getComputedStyle(icon as SVGSVGElement).color, `${size} icon color`).toBe(
      tokenRgb("status-error-ui"),
    );

    const textRect = textNodeRect(button.lastChild as ChildNode);
    const gap = textRect.left - iconRect.right;
    expect(gap, `${size} gap`).toBeGreaterThan(7);
    expect(gap, `${size} gap`).toBeLessThan(9);

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("accepts the text-only destructive form at both drawn sizes", () => {
  expectTypeOf<{ variant: "text"; tone: "destructive" }>().toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{
    variant: "text";
    tone: "destructive";
    size: "small";
  }>().toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{
    variant: "text";
    tone: "destructive";
    size: "large";
  }>().toExtend<ButtonPropsWithoutText>();
});

test("does not accept the text variant in any tone but destructive, the only one drawn", () => {
  expectTypeOf<{ variant: "text" }>().not.toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{ variant: "text"; tone: "default" }>().not.toExtend<ButtonPropsWithoutText>();
});

test("does not accept a caller's icon on the text variant, which carries its own", () => {
  expectTypeOf<{
    variant: "text";
    tone: "destructive";
    icon: ButtonIcon;
  }>().not.toExtend<ButtonPropsWithoutText>();
});

test("does not accept the text variant at a size the design never draws it", () => {
  expectTypeOf<{
    variant: "text";
    tone: "destructive";
    size: "medium";
  }>().not.toExtend<ButtonPropsWithoutText>();
  expectTypeOf<{
    variant: "text";
    tone: "destructive";
    size: "sale";
  }>().not.toExtend<ButtonPropsWithoutText>();
});

test("turns the text-only destructive form's background bone on hover, keeping its error-UI label", async () => {
  const screen = await render(
    <Button variant="text" tone="destructive">
      Cancel sale
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  await userEvent.hover(button);
  // See the primary hover test above: wait for the exact designed token, not just any opaque color.
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-bone"));

  const hovered = getComputedStyle(button);
  expect(hovered.color).toBe(tokenRgb("status-error-ui"));
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the text-only destructive form's label and icon readable on the surfaces it sits on", async () => {
  // The button paints no background of its own at rest, so the surface behind it is what its
  // label and icon have to stand out against: the two this form is drawn on.
  for (const surface of ["surface-white", "surface-bone"] as const) {
    const screen = await render(
      <div style={{ backgroundColor: tokenRgb(surface) }}>
        <Button variant="text" tone="destructive">
          {`Cancel sale on ${surface}`}
        </Button>
      </div>,
    );
    const button = screen
      .getByRole("button", { name: `Cancel sale on ${surface}` })
      .element() as HTMLElement;
    const icon = button.querySelector("svg") as SVGSVGElement;
    const behind = getComputedStyle(button.parentElement as HTMLElement).backgroundColor;

    expect(behind, `${surface} behind the button`).toBe(tokenRgb(surface));
    expect(getComputedStyle(button).backgroundColor, `${surface} button background`).toBe(
      "rgba(0, 0, 0, 0)",
    );

    const labelRatio = contrastRatio(rgbToHex(getComputedStyle(button).color), rgbToHex(behind));
    const iconRatio = contrastRatio(rgbToHex(getComputedStyle(icon).color), rgbToHex(behind));
    expect(labelRatio, `${surface} label contrast`).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    expect(iconRatio, `${surface} icon contrast`).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("shows the shared focus outline on the text-only destructive form", async () => {
  const screen = await render(
    <Button variant="text" tone="destructive">
      Cancel sale
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(button).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  await expectNoAccessibilityViolations(screen.container);
});

test("activates the text-only destructive form by keyboard and by pointer", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <Button variant="text" tone="destructive" onPress={onPress}>
      Cancel sale
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);

  await userEvent.keyboard(" ");
  expect(onPress).toHaveBeenCalledTimes(2);

  await userEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(3);

  await expectNoAccessibilityViolations(screen.container);
});

test("dims a disabled text-only destructive form and keeps it out of reach", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <Button variant="text" tone="destructive" onPress={onPress} isDisabled>
      Cancel sale
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" });
  const element = button.element() as HTMLElement;

  await expect.element(button).toBeDisabled();
  expect(getComputedStyle(element).opacity).toBe("0.45");
  expect(getComputedStyle(element).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  await userEvent.tab();
  expect(document.activeElement).not.toBe(element);

  await button.click({ force: true });
  expect(onPress).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});
