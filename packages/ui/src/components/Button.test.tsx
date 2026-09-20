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

// An icon's shape lives in its svg's children, and every lucide icon draws a different one, so
// rendering the expected icon on its own gives a shape to compare a button's icon against. Size
// and color are imposed from outside and match across icons, which is why they can't tell them
// apart on their own.
async function lucideShape(icon: ButtonIcon): Promise<string> {
  const screen = await render(icon);
  return (screen.container.querySelector("svg") as SVGSVGElement).innerHTML;
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

test("defaults the primary and secondary variants to the medium size when none is given", async () => {
  const primary = await buttonStyle("Default primary");
  const secondary = await buttonStyle("Default secondary", { variant: "secondary" });

  expect(primary.height).toBe("48px");
  expect(primary.fontSize).toBe("16px");
  expect(secondary.height).toBe("48px");
  expect(secondary.fontSize).toBe("16px");
});

test("renders every size in the design's height and text-size scale, shared by the primary and secondary variants", async () => {
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

test("renders bold text on the primary and secondary variants", async () => {
  const primary = await buttonStyle("Primary");
  const secondary = await buttonStyle("Secondary", { variant: "secondary" });

  expect(primary.fontWeight).toBe("700");
  expect(secondary.fontWeight).toBe("700");
});

test("dims a disabled button to the design's 45% opacity, on the primary and secondary variants", async () => {
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
  // The stroke the glyph is painted with, not the color it inherits: an icon that brought a
  // stroke of its own would inherit the button's color just the same and pass on that reading.
  expect(getComputedStyle(icon as SVGSVGElement).stroke).toBe(tokenRgb("surface-white"));

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
  // See the primary variant's icon test above: the painted stroke, not the inherited color.
  expect(getComputedStyle(icon as SVGSVGElement).stroke).toBe(tokenRgb("ink"));

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

test("keeps a caller's icon at its variant's size across every button size", async () => {
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

test("rounds the text-only destructive form like the package's other transparent surface", async () => {
  // Nothing of the button's own is rounded here — the radius shapes the bone background it takes
  // on hover, so it is the one the secondary button rounds that same background with.
  const text = await buttonStyle("Cancel sale", { variant: "text", tone: "destructive" });
  const secondary = await buttonStyle("Cancel", { variant: "secondary" });

  expect(text.borderRadius).toBe("6px");
  expect(text.borderRadius).toBe(secondary.borderRadius);
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
  const x = await lucideShape(<X />);
  expect(x, "the comparison below tells lucide icons apart").not.toBe(await lucideShape(<Check />));

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

    // The glyph itself, not just any icon of the right size and color.
    expect((icon as SVGSVGElement).innerHTML, `${size} glyph`).toBe(x);

    const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
    expect(iconRect.width, `${size} icon width`).toBeGreaterThan(17);
    expect(iconRect.width, `${size} icon width`).toBeLessThan(19);
    expect(iconRect.height, `${size} icon height`).toBeGreaterThan(17);
    expect(iconRect.height, `${size} icon height`).toBeLessThan(19);
    // The stroke is what paints a lucide glyph: reading the inherited `color` instead would pass
    // just as well for an icon that hardcoded a stroke of its own.
    expect(getComputedStyle(icon as SVGSVGElement).stroke, `${size} icon stroke`).toBe(
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
    // The glyph's own painted stroke, so this ratio can differ from the label's and fail alone.
    const iconRatio = contrastRatio(rgbToHex(getComputedStyle(icon).stroke), rgbToHex(behind));
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

// The design's rows are 12px-gapped horizontal footers; the widths below are measured against a
// container of a known size so a stretched button's share of it can be checked exactly.
const rowStyle = { width: "500px", display: "flex", gap: "12px" } as const;

function renderedWidth(screen: Awaited<ReturnType<typeof render>>, name: string): number {
  return (screen.getByRole("button", { name }).element() as HTMLElement).getBoundingClientRect()
    .width;
}

// A row keeps its buttons by position, so measuring them through the row itself compares the very
// elements laid out together, and stays unambiguous when two of them carry the same label.
function widthsInRow(row: Element): number[] {
  return [...row.children].map((button) => button.getBoundingClientRect().width);
}

// One rect per line box the text is laid out on, so a label pushed onto a second line counts 2.
function lineCount(node: ChildNode): number {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getClientRects().length;
}

test("takes the whole row when it is the only button in it", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button fullWidth>Confirm</Button>
    </div>,
  );

  expect(renderedWidth(screen, "Confirm")).toBeCloseTo(500, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("takes the width a content-sized sibling leaves it in a row", async () => {
  const lonely = await render(
    <div style={rowStyle}>
      <Button variant="secondary">Back</Button>
    </div>,
  );
  const [ownWidth] = widthsInRow(lonely.container.firstElementChild as Element);

  const screen = await render(
    <div style={rowStyle}>
      <Button variant="secondary">Back</Button>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [sibling, stretched] = widthsInRow(screen.container.firstElementChild as Element);

  // Measured against the width that button has on its own, so a regression that stretched both of
  // them — and still filled the row exactly — fails here instead of passing on the arithmetic.
  expect(sibling).toBeCloseTo(ownWidth as number, 0);
  expect(stretched).toBeCloseTo(500 - (sibling as number) - 12, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("splits the row evenly with another stretched button of its variant, whatever their labels", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button fullWidth>No</Button>
      <Button fullWidth>Charge to the account</Button>
    </div>,
  );
  const [shortLabel, longLabel] = widthsInRow(screen.container.firstElementChild as Element);
  const longer = screen
    .getByRole("button", { name: "Charge to the account" })
    .element() as HTMLElement;

  expect(shortLabel).toBeCloseTo(longLabel as number, 0);
  expect((shortLabel as number) + (longLabel as number) + 12).toBeCloseTo(500, 0);
  // Labels of different lengths, each still on the one line its button has room for.
  expect(lineCount(longer.firstChild as ChildNode)).toBe(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("shares the row with a stretched button of another variant, neither sized by its label", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button variant="secondary" fullWidth>
        No
      </Button>
      <Button fullWidth>Charge to the account</Button>
    </div>,
  );
  const [borderedButton, borderlessButton] = [
    ...(screen.container.firstElementChild as Element).children,
  ] as HTMLElement[];
  const [bordered, borderless] = widthsInRow(screen.container.firstElementChild as Element);
  const style = getComputedStyle(borderedButton as HTMLElement);
  const border =
    Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);

  expect(lineCount((borderlessButton as HTMLElement).firstChild as ChildNode)).toBe(1);
  expect((bordered as number) + (borderless as number) + 12).toBeCloseTo(500, 0);
  // They grow from nothing into equal halves of what the row has free, so what each ends up
  // measuring differs by exactly the border one of them draws and the other does not.
  expect((bordered as number) - (borderless as number)).toBeCloseTo(border, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the rest of the row to its siblings when it is not asked to stretch", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button variant="secondary">Back</Button>
      <Button>Confirm</Button>
    </div>,
  );

  expect(renderedWidth(screen, "Back") + renderedWidth(screen, "Confirm") + 12).toBeLessThan(500);
  await expectNoAccessibilityViolations(screen.container);
});

test("is available on every variant", () => {
  // Asserted from the union's side: every branch of it has to carry the option. Asserting it the
  // other way round, from a literal that names a variant and the option, proves nothing — a
  // property the branch never declared is simply ignored when the two are compared.
  expectTypeOf<ButtonPropsWithoutText>().toExtend<{ fullWidth?: boolean | undefined }>();
});

// One stack is given a height far larger than a button's, the other takes whatever height its
// buttons come to: a stretched button has to come out the same height in both.
const stackStyle = {
  width: "500px",
  height: "400px",
  display: "flex",
  flexDirection: "column",
} as const;
const contentHeightStackStyle = {
  width: "500px",
  display: "flex",
  flexDirection: "column",
} as const;

test("is the height of its size in a stack that takes its height from its buttons", async () => {
  const expected: Record<ButtonSize, number> = { small: 40, medium: 48, large: 56, sale: 72 };

  for (const size of sizes) {
    const screen = await render(
      <div style={contentHeightStackStyle}>
        <Button size={size} fullWidth>{`Stretched ${size}`}</Button>
      </div>,
    );
    const stack = screen.container.firstElementChild as HTMLElement;
    const button = stack.firstElementChild as HTMLElement;

    expect(button.getBoundingClientRect().height, `${size} button`).toBeCloseTo(expected[size], 0);
    expect(stack.getBoundingClientRect().height, `${size} stack`).toBeCloseTo(expected[size], 0);
    await expectNoAccessibilityViolations(screen.container);
  }
});

test("is the height of the size it falls back to, in that same stack, on the text variant", async () => {
  // The text variant does not default to the size the others do, so it reaches the height classes
  // by a different route and is worth measuring where a stretched button's height is decided.
  const screen = await render(
    <div style={contentHeightStackStyle}>
      <Button variant="text" tone="destructive" fullWidth>
        Cancel sale
      </Button>
    </div>,
  );
  const stack = screen.container.firstElementChild as HTMLElement;
  const button = stack.firstElementChild as HTMLElement;

  expect(button.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(stack.getBoundingClientRect().height).toBeCloseTo(40, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("has nothing to take in a row that is only as wide as what it holds", async () => {
  const screen = await render(
    <div style={{ width: "max-content", display: "flex", gap: "12px" }}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const row = screen.container.firstElementChild as Element;
  const [sibling, stretched] = widthsInRow(row);
  const plain = await render(
    <div>
      <Button>Confirm</Button>
    </div>,
  );
  const [unstretched] = widthsInRow(plain.container.firstElementChild as Element);

  // Such a row is as wide as its buttons make it, so there is no space left over to grow into and
  // asking for it changes nothing. Pinned so the day that stops being true is a failure, not a
  // surprise on a screen.
  expect(stretched).toBeCloseTo(unstretched as number, 0);
  expect(row.getBoundingClientRect().width).toBeCloseTo(
    (sibling as number) + (stretched as number) + 12,
    0,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps its height, its padding and its centering when stretched, at every size", async () => {
  for (const size of sizes) {
    const plain = await buttonStyle(`Plain ${size}`, { size });
    const stretched = await buttonStyle(`Stretched ${size}`, { size, fullWidth: true });

    expect(stretched.height, `${size} height`).toBe(plain.height);
    expect(stretched.fontSize, `${size} font size`).toBe(plain.fontSize);
    expect(stretched.paddingLeft, `${size} padding-left`).toBe("16px");
    expect(stretched.paddingRight, `${size} padding-right`).toBe("16px");
    expect(stretched.paddingTop, `${size} padding-top`).toBe("0px");
    expect(stretched.paddingBottom, `${size} padding-bottom`).toBe("0px");
    expect(stretched.justifyContent, `${size} justify-content`).toBe("center");
    expect(stretched.alignItems, `${size} align-items`).toBe("center");
  }
});

test("keeps its icon and label together in the middle of the width it is given", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button variant="text" tone="destructive" fullWidth>
        Cancel sale
      </Button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;
  const buttonRect = button.getBoundingClientRect();
  const iconRect = (button.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
  const labelRect = textNodeRect(button.lastChild as ChildNode);

  const beforeIcon = iconRect.left - buttonRect.left;
  const afterLabel = buttonRect.right - labelRect.right;

  // Centered in the row, not pushed against the 16px padding at either end.
  expect(beforeIcon).toBeGreaterThan(16);
  expect(beforeIcon).toBeCloseTo(afterLabel, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("takes the width of a vertical stack without being asked to stretch", async () => {
  const screen = await render(
    <div style={stackStyle}>
      <Button>Confirm</Button>
    </div>,
  );

  expect(renderedWidth(screen, "Confirm")).toBeCloseTo(500, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("grows across a vertical stack but never along it", async () => {
  const screen = await render(
    <div style={stackStyle}>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const rect = (
    screen.getByRole("button", { name: "Confirm" }).element() as HTMLElement
  ).getBoundingClientRect();

  expect(rect.width).toBeCloseTo(500, 0);
  // The stack is 400px tall and holds this button alone: a button that grew along it would take
  // the whole height instead of the 48px its size gives it.
  expect(rect.height).toBeCloseTo(48, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("leaves a content-sized sibling at its own width, even one whose label could wrap", async () => {
  const label = "Salir sin completar";
  const alone = await render(
    <div style={rowStyle}>
      <Button variant="secondary">{label}</Button>
    </div>,
  );
  const [ownWidth] = widthsInRow(alone.container.firstElementChild as Element);

  const screen = await render(
    <div style={rowStyle}>
      <Button variant="secondary">{label}</Button>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [sibling] = widthsInRow(screen.container.firstElementChild as Element);

  // A stretched button that asked the row for more than it has would take the difference out of
  // this sibling, narrowing it toward its longest word and breaking the label across two lines the
  // design never draws it on.
  expect(sibling).toBeCloseTo(ownWidth as number, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps every label in the row on a single line", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirmar la venta</Button>
    </div>,
  );
  const [sibling, stretched] = [
    ...(screen.container.firstElementChild as Element).children,
  ] as HTMLElement[];

  // The design draws every one of these labels on one line, and a button's height is fixed, so a
  // label that wrapped would either fill the button edge to edge or spill past it — nothing hides
  // it, since the button clips nothing.
  expect(lineCount((sibling as HTMLElement).firstChild as ChildNode), "sibling").toBe(1);
  expect(lineCount((stretched as HTMLElement).firstChild as ChildNode), "stretched").toBe(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("paints its hover background across the whole width it was given", async () => {
  const screen = await render(
    <div style={rowStyle}>
      <Button variant="text" tone="destructive" fullWidth>
        Cancel sale
      </Button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-bone"));

  // The bone surface is the button's own box, so stretching it stretches the surface: the radius
  // that rounds it still does so at the row's edges, not at the label's.
  expect(button.getBoundingClientRect().width).toBeCloseTo(500, 0);
  expect(getComputedStyle(button).borderRadius).toBe("6px");
  await expectNoAccessibilityViolations(screen.container);
});
