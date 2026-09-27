import axe from "axe-core";
import { Check, X } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import {
  Button,
  type ButtonIcon,
  type ButtonProps,
  type ButtonSize,
  type ButtonTextSize,
  type ButtonVariant,
} from "./Button";

const sizes: ButtonSize[] = ["small", "medium", "large", "sale"];

// A plain Omit collapses ButtonProps' union to common keys; this distributes it over each member.
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

// A Range over the text node itself reports the glyphs' own fractional box, unrounded — unlike
// scrollWidth/clientWidth, which round to a whole pixel and only describe the clip box around it.
function textNodeRect(node: ChildNode): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect();
}

// Every lucide icon renders the same size and color once inside the button, so only the svg's own
// children (its drawn shape) can tell one icon apart from another.
async function lucideShape(icon: ButtonIcon): Promise<string> {
  const screen = await render(icon);
  return (screen.container.querySelector("svg") as SVGSVGElement).innerHTML;
}

function iconStrokeColor(icon: SVGSVGElement): string {
  return getComputedStyle(icon).stroke;
}

// Polls rather than reading once, since a mid-transition color is a plain opaque rgb() too.
async function expectHoverBackground(button: HTMLElement, token: string): Promise<void> {
  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb(token));
}

test("renders the text provided by the caller", async () => {
  const screen = await render(<Button>Save</Button>);

  await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
});

test("activates on Enter when focused via keyboard", async () => {
  const onPress = vi.fn();
  await render(<Button onPress={onPress}>Save</Button>);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
});

test("activates on Space when focused via keyboard", async () => {
  const onPress = vi.fn();
  await render(<Button onPress={onPress}>Save</Button>);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(onPress).toHaveBeenCalledOnce();
});

test("shows a visible focus outline in strong blue when reached by keyboard", async () => {
  const screen = await render(<Button>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" }).element() as HTMLElement;
  const focusRingColor = tokenRgb("brand-blue-strong");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineColor).toBe(focusRingColor);
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
});

test("renders the secondary variant with a transparent background, earth-toned border and ink text", async () => {
  const screen = await render(<Button variant="secondary">Cancel</Button>);
  const button = screen.getByRole("button", { name: "Cancel" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(button).borderWidth).toBe("1px");
  expect(getComputedStyle(button).borderColor).toBe(tokenRgb("brand-earth-ui"));
  expect(getComputedStyle(button).color).toBe(tokenRgb("ink"));
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

test("shows the hand cursor when enabled and the arrow cursor when disabled", async () => {
  const enabled = await buttonStyle("Enabled");
  const disabled = await buttonStyle("Disabled", { isDisabled: true });

  expect(enabled.cursor).toBe("pointer");
  expect(disabled.cursor).toBe("default");
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
  await expectHoverBackground(button, "brand-blue-strong");

  const hovered = getComputedStyle(button);
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the secondary variant's hover text readable against its background", async () => {
  const screen = await render(<Button variant="secondary">Cancel</Button>);
  const button = screen.getByRole("button", { name: "Cancel" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expectHoverBackground(button, "surface-bone");

  const hovered = getComputedStyle(button);
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("renders the destructive tone of the primary button with an error background and white text", async () => {
  const screen = await render(<Button tone="destructive">Void sale</Button>);
  const button = screen.getByRole("button", { name: "Void sale" }).element() as HTMLElement;

  expect(getComputedStyle(button).backgroundColor).toBe(tokenRgb("status-error-ui"));
  expect(getComputedStyle(button).color).toBe(tokenRgb("surface-white"));
});

test("turns the destructive tone's hover background to error-strong, keeping white text readable", async () => {
  const screen = await render(<Button tone="destructive">Void sale</Button>);
  const button = screen.getByRole("button", { name: "Void sale" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expectHoverBackground(button, "status-error-strong");

  const hovered = getComputedStyle(button);
  expect(hovered.color).toBe(tokenRgb("surface-white"));
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("renders the destructive tone of the secondary variant with a white fill and error-ui border and text, as the design draws it", async () => {
  const screen = await render(
    <div style={{ backgroundColor: tokenRgb("surface-white") }}>
      <Button variant="secondary" tone="destructive">
        Desactivar
      </Button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "Desactivar" }).element() as HTMLElement;
  const behind = getComputedStyle(button.parentElement as HTMLElement).backgroundColor;

  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(button).borderWidth).toBe("1px");
  expect(getComputedStyle(button).borderColor).toBe(tokenRgb("status-error-ui"));
  expect(getComputedStyle(button).color).toBe(tokenRgb("status-error-ui"));

  const ratio = contrastRatio(rgbToHex(getComputedStyle(button).color), rgbToHex(behind));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the destructive secondary variant's hover background at bone, like the default secondary and the text destructive form, and keeps its error-ui border and text readable", async () => {
  const screen = await render(
    <Button variant="secondary" tone="destructive">
      Desactivar
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Desactivar" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expectHoverBackground(button, "surface-bone");

  const hovered = getComputedStyle(button);
  expect(hovered.borderColor).toBe(tokenRgb("status-error-ui"));
  expect(hovered.color).toBe(tokenRgb("status-error-ui"));
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
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
  const labelWrapper = button.firstChild as HTMLElement;

  expect(icon).not.toBeNull();
  expect(labelWrapper.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(labelWrapper.textContent).toBe("Save");
  expect(iconWrapper.contains(icon)).toBe(true);

  const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(23);
  expect(iconRect.width).toBeLessThan(25);
  expect(iconRect.height).toBeGreaterThan(23);
  expect(iconRect.height).toBeLessThan(25);
  expect(iconStrokeColor(icon as SVGSVGElement)).toBe(tokenRgb("surface-white"));

  const textRect = textNodeRect(labelWrapper.firstChild as ChildNode);
  const gap = iconRect.left - textRect.right;
  expect(gap).toBeGreaterThan(11);
  expect(gap).toBeLessThan(13);
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
  const labelWrapper = button.lastChild as HTMLElement;

  expect(icon).not.toBeNull();
  expect(iconWrapper.contains(icon)).toBe(true);
  expect(labelWrapper.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(labelWrapper.textContent).toBe("Cancel");

  const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);
  expect(iconRect.height).toBeGreaterThan(17);
  expect(iconRect.height).toBeLessThan(19);
  expect(iconStrokeColor(icon as SVGSVGElement)).toBe(tokenRgb("ink"));

  const textRect = textNodeRect(labelWrapper.firstChild as ChildNode);
  const gap = textRect.left - iconRect.right;
  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);
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

test("accepts a destructive tone on the secondary variant, since the design draws it", () => {
  expectTypeOf<{
    variant: "secondary";
    tone: "destructive";
  }>().toExtend<ButtonPropsWithoutText>();
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
    const labelWrapper = button.lastChild as HTMLElement;

    expect(icon, `${size} icon`).not.toBeNull();
    expect(iconWrapper.contains(icon), `${size} icon wrapper`).toBe(true);
    expect(labelWrapper.firstChild?.nodeType, `${size} label node`).toBe(Node.TEXT_NODE);
    expect(labelWrapper.textContent, `${size} label`).toBe(`Cancel sale ${size}`);

    expect((icon as SVGSVGElement).innerHTML, `${size} glyph`).toBe(x);

    const iconRect = (icon as SVGSVGElement).getBoundingClientRect();
    expect(iconRect.width, `${size} icon width`).toBeGreaterThan(17);
    expect(iconRect.width, `${size} icon width`).toBeLessThan(19);
    expect(iconRect.height, `${size} icon height`).toBeGreaterThan(17);
    expect(iconRect.height, `${size} icon height`).toBeLessThan(19);
    expect(iconStrokeColor(icon as SVGSVGElement), `${size} icon stroke`).toBe(
      tokenRgb("status-error-ui"),
    );

    const textRect = textNodeRect(labelWrapper.firstChild as ChildNode);
    const gap = textRect.left - iconRect.right;
    expect(gap, `${size} gap`).toBeGreaterThan(7);
    expect(gap, `${size} gap`).toBeLessThan(9);
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
  await expectHoverBackground(button, "surface-bone");

  const hovered = getComputedStyle(button);
  expect(hovered.color).toBe(tokenRgb("status-error-ui"));
  const ratio = contrastRatio(rgbToHex(hovered.color), rgbToHex(hovered.backgroundColor));
  expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("keeps the text-only destructive form's label and icon readable on the surfaces it sits on", async () => {
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
    const iconRatio = contrastRatio(rgbToHex(iconStrokeColor(icon)), rgbToHex(behind));
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
});

const fixedWidthRowStyle = { width: "500px", display: "flex", gap: "12px" } as const;

function renderedWidth(screen: Awaited<ReturnType<typeof render>>, name: string): number {
  return (screen.getByRole("button", { name }).element() as HTMLElement).getBoundingClientRect()
    .width;
}

function widthsByPosition(row: Element): number[] {
  return [...row.children].map((button) => button.getBoundingClientRect().width);
}

function labelSpan(button: HTMLElement): HTMLElement {
  const [label, ...also] = [...button.children].filter(
    (child) => child.textContent === button.textContent,
  );
  if (!(label instanceof HTMLElement) || also.length > 0) {
    throw new Error(
      `labelSpan needs one child holding the whole label "${button.textContent}", matched ${
        label ? also.length + 1 : 0
      } of ${button.children.length}`,
    );
  }
  return label;
}

// scrollWidth/clientWidth alone can't tell an ellipsis from a silent clip; only text-overflow does.
// clientWidth > 0 also rules out a box collapsed to nothing that would still report ellipsis.
function expectTruncatedWithEllipsis(span: HTMLElement, label: string): void {
  expect(span.clientWidth, `${label} visible`).toBeGreaterThan(0);
  expect(span.scrollWidth, `${label} truncated`).toBeGreaterThan(span.clientWidth);
  expect(getComputedStyle(span).textOverflow, `${label} ellipsis`).toBe("ellipsis");
}

// One client rect per line box — but only when not truncated: an ellipsis reports the hidden
// overflow as a second rect on the same line, counting 2 for a label that never wrapped.
function lineCount(node: ChildNode): number {
  if (node.nodeType !== Node.TEXT_NODE) {
    throw new Error(`lineCount needs the label's text node, got nodeType ${node.nodeType}`);
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getClientRects().length;
}

test("takes the whole row when it is the only button in it", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button fullWidth>Confirm</Button>
    </div>,
  );

  expect(renderedWidth(screen, "Confirm")).toBeCloseTo(500, 0);
});

test("takes the width a content-sized sibling leaves it in a row", async () => {
  const lonely = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">Back</Button>
    </div>,
  );
  const [ownWidth] = widthsByPosition(lonely.container.firstElementChild as Element);

  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">Back</Button>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [sibling, stretched] = widthsByPosition(screen.container.firstElementChild as Element);

  expect(sibling).toBeCloseTo(ownWidth as number, 0);
  expect(stretched).toBeCloseTo(500 - (sibling as number) - 12, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("splits the row evenly with another stretched button of its variant, labels of either length", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button fullWidth>No</Button>
      <Button fullWidth>Charge to the account</Button>
    </div>,
  );
  const row = screen.container.firstElementChild as Element;
  const [shortLabel, longLabel] = widthsByPosition(row);
  const [shorter, longer] = [...row.children] as HTMLElement[];

  expect(shortLabel).toBeCloseTo(longLabel as number, 0);
  expect((shortLabel as number) + (longLabel as number) + 12).toBeCloseTo(500, 0);
  expect(lineCount(labelSpan(shorter as HTMLElement).firstChild as ChildNode), "shorter").toBe(1);
  expect(lineCount(labelSpan(longer as HTMLElement).firstChild as ChildNode), "longer").toBe(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("shares the row with a stretched button of another variant, neither sized by its label", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary" fullWidth>
        No
      </Button>
      <Button fullWidth>Charge to the account</Button>
    </div>,
  );
  const [borderedButton, borderlessButton] = [
    ...(screen.container.firstElementChild as Element).children,
  ] as HTMLElement[];
  const [bordered, borderless] = widthsByPosition(screen.container.firstElementChild as Element);
  const style = getComputedStyle(borderedButton as HTMLElement);
  const border =
    Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);

  expect(lineCount(labelSpan(borderlessButton as HTMLElement).firstChild as ChildNode)).toBe(1);
  expect((bordered as number) + (borderless as number) + 12).toBeCloseTo(500, 0);
  expect((bordered as number) - (borderless as number)).toBeCloseTo(border, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the row unfilled when no button in it was asked to stretch", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">Back</Button>
      <Button>Confirm</Button>
    </div>,
  );

  expect(renderedWidth(screen, "Back") + renderedWidth(screen, "Confirm") + 12).toBeLessThan(500);
  await expectNoAccessibilityViolations(screen.container);
});

test("is available on every variant", () => {
  expectTypeOf<ButtonPropsWithoutText>().toExtend<{ fullWidth?: boolean | undefined }>();
});

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
  const [sibling, stretched] = widthsByPosition(row);
  const plain = await render(
    <div>
      <Button>Confirm</Button>
    </div>,
  );
  const [unstretched] = widthsByPosition(plain.container.firstElementChild as Element);

  expect(stretched).toBeCloseTo(unstretched as number, 0);
  expect(row.getBoundingClientRect().width).toBeCloseTo(
    (sibling as number) + (stretched as number) + 12,
    0,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps its height, its padding and its centering when stretched, at every size", async () => {
  const expected: Record<ButtonSize, number> = { small: 40, medium: 48, large: 56, sale: 72 };

  for (const size of sizes) {
    const plain = await buttonStyle(`Plain ${size}`, { size });
    const row = await render(
      <div style={fixedWidthRowStyle}>
        <Button size={size} fullWidth>{`Row ${size}`}</Button>
      </div>,
    );
    const inRow = row.container.firstElementChild?.firstElementChild as HTMLElement;
    const stack = await render(
      <div style={stackStyle}>
        <Button size={size} fullWidth>{`Stack ${size}`}</Button>
      </div>,
    );
    const inStack = stack.container.firstElementChild?.firstElementChild as HTMLElement;
    const stretched = getComputedStyle(inRow);

    expect(inRow.getBoundingClientRect().height, `${size} height in a row`).toBeCloseTo(
      expected[size],
      0,
    );
    expect(inStack.getBoundingClientRect().height, `${size} height in a stack`).toBeCloseTo(
      expected[size],
      0,
    );
    expect(inRow.getBoundingClientRect().width, `${size} width in a row`).toBeCloseTo(500, 0);
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
    <div style={fixedWidthRowStyle}>
      <Button variant="text" tone="destructive" fullWidth>
        Cancel sale
      </Button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;
  const buttonRect = button.getBoundingClientRect();
  const iconRect = (button.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
  const labelRect = textNodeRect(labelSpan(button).firstChild as ChildNode);

  const beforeIcon = iconRect.left - buttonRect.left;
  const afterLabel = buttonRect.right - labelRect.right;

  expect(beforeIcon).toBeGreaterThan(16);
  expect(beforeIcon).toBeCloseTo(afterLabel, 0);
  expect(labelRect.left - iconRect.right).toBeCloseTo(8, 0);
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

test("leaves a content-sized sibling at its own width in a row wide enough for both", async () => {
  const label = "Salir sin completar";
  const alone = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">{label}</Button>
    </div>,
  );
  const [ownWidth] = widthsByPosition(alone.container.firstElementChild as Element);

  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">{label}</Button>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [sibling] = widthsByPosition(screen.container.firstElementChild as Element);

  expect(sibling).toBeCloseTo(ownWidth as number, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("squeezes every button in a row too narrow for them, stretched or not", async () => {
  const screen = await render(
    <div style={{ width: "200px", display: "flex", gap: "12px" }}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirmar la venta</Button>
    </div>,
  );
  const row = screen.container.firstElementChild as Element;
  const [sibling, stretched] = widthsByPosition(row);
  const [siblingButton, stretchedButton] = [...row.children] as HTMLElement[];
  const stretchedStyle = getComputedStyle(stretchedButton as HTMLElement);
  const chrome =
    Number.parseFloat(stretchedStyle.paddingLeft) +
    Number.parseFloat(stretchedStyle.paddingRight) +
    Number.parseFloat(stretchedStyle.borderLeftWidth) +
    Number.parseFloat(stretchedStyle.borderRightWidth);

  const roomy = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirmar la venta</Button>
    </div>,
  );
  const [siblingWithRoom] = widthsByPosition(roomy.container.firstElementChild as Element);

  expect(sibling as number).toBeLessThan(siblingWithRoom as number);
  expect(stretched as number).toBeGreaterThan(0);
  expect((sibling as number) + (stretched as number) + 12).toBeCloseTo(200, 0);
  expect(row.getBoundingClientRect().width).toBeCloseTo(200, 0);
  expectTruncatedWithEllipsis(labelSpan(siblingButton as HTMLElement), "sibling");
  expect(stretched as number, "stretched down to its chrome").toBeCloseTo(chrome, 0);
  expect(labelSpan(stretchedButton as HTMLElement).clientWidth, "stretched label box").toBe(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("shortens a stretched button's label to an ellipsis where the row leaves it room for one", async () => {
  const screen = await render(
    <div style={{ width: "300px", display: "flex", gap: "12px" }}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirmar la venta</Button>
    </div>,
  );
  const row = screen.container.firstElementChild as Element;
  const [sibling, stretched] = widthsByPosition(row);
  const [, stretchedButton] = [...row.children] as HTMLElement[];
  const span = labelSpan(stretchedButton as HTMLElement);

  expect((sibling as number) + (stretched as number) + 12).toBeCloseTo(300, 0);
  expectTruncatedWithEllipsis(span, "stretched");
  expect(span.textContent, "stretched label").toBe("Confirmar la venta");
  await expectNoAccessibilityViolations(screen.container);
});

test("is squeezed by a container shorter than it only when it was not asked to stretch", async () => {
  const shortStack = {
    width: "500px",
    height: "20px",
    display: "flex",
    flexDirection: "column",
  } as const;
  const plain = await render(
    <div style={shortStack}>
      <Button>Confirm</Button>
    </div>,
  );
  const stretched = await render(
    <div style={shortStack}>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [plainButton] = [...(plain.container.firstElementChild as Element).children];
  const [stretchedButton] = [...(stretched.container.firstElementChild as Element).children];
  const plainHeight = (plainButton as HTMLElement).getBoundingClientRect().height;
  const stretchedHeight = (stretchedButton as HTMLElement).getBoundingClientRect().height;

  expect(plainHeight).toBeLessThan(48);
  expect(stretchedHeight).toBeCloseTo(48, 0);
  await expectNoAccessibilityViolations(plain.container);
});

test("is as wide as its content in a container that lays nothing out in a row", async () => {
  const blockStyle = { width: "500px" } as const;
  const plain = await render(
    <div style={blockStyle}>
      <Button>Confirm</Button>
    </div>,
  );
  const stretched = await render(
    <div style={blockStyle}>
      <Button fullWidth>Confirm</Button>
    </div>,
  );
  const [plainWidth] = widthsByPosition(plain.container.firstElementChild as Element);
  const [stretchedWidth] = widthsByPosition(stretched.container.firstElementChild as Element);

  expect(stretchedWidth).toBeCloseTo(plainWidth as number, 0);
  expect(stretchedWidth as number).toBeLessThan(500);
  await expectNoAccessibilityViolations(stretched.container);
});

test("stays inside a container that lays nothing out in a row, shortening its label instead", async () => {
  const label = "This label is far longer than a container two hundred pixels wide can ever hold";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <Button fullWidth>{label}</Button>
    </div>,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const button = screen.getByRole("button", { name: label }).element() as HTMLElement;

  expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(200);
  expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
    container.getBoundingClientRect().right,
  );
  expectTruncatedWithEllipsis(labelSpan(button), "stretched in a block container");
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps every label in the row on a single line", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="secondary">Salir sin completar</Button>
      <Button fullWidth>Confirmar la venta</Button>
    </div>,
  );
  const [sibling, stretched] = [
    ...(screen.container.firstElementChild as Element).children,
  ] as HTMLElement[];

  expect(lineCount(labelSpan(sibling as HTMLElement).firstChild as ChildNode), "sibling").toBe(1);
  expect(lineCount(labelSpan(stretched as HTMLElement).firstChild as ChildNode), "stretched").toBe(
    1,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("paints its hover background across the whole width it was given", async () => {
  const screen = await render(
    <div style={fixedWidthRowStyle}>
      <Button variant="text" tone="destructive" fullWidth>
        Cancel sale
      </Button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "Cancel sale" }).element() as HTMLElement;

  await userEvent.hover(button);
  await expectHoverBackground(button, "surface-bone");

  expect(button.getBoundingClientRect().width).toBeCloseTo(500, 0);
  expect(getComputedStyle(button).borderRadius).toBe("6px");
  await expectNoAccessibilityViolations(screen.container);
});

const heightBySize: Record<ButtonSize, number> = { small: 40, medium: 48, large: 56, sale: 72 };

const sizesDrawnByVariant: Array<{ variant: ButtonVariant; sizes: ButtonSize[] }> = [
  { variant: "primary", sizes },
  { variant: "secondary", sizes },
  { variant: "text", sizes: ["small", "large"] },
];

function renderWithVariant(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  label: string,
) {
  return variant === "text" ? (
    <Button variant="text" tone="destructive" size={size as ButtonTextSize} fullWidth={fullWidth}>
      {label}
    </Button>
  ) : (
    <Button variant={variant} size={size} fullWidth={fullWidth}>
      {label}
    </Button>
  );
}

test("keeps the full label visible with no ellipsis when it fits, at every size and variant, stretched or not", async () => {
  for (const { variant, sizes: variantSizeList } of sizesDrawnByVariant) {
    for (const size of variantSizeList) {
      for (const fullWidth of [false, true]) {
        const label = `Fits ${variant} ${size} ${fullWidth ? "stretched" : "content"}`;
        // A fixed width so this doesn't depend on the runner's own viewport.
        const screen = await render(
          <div style={fullWidth ? fixedWidthRowStyle : { width: "500px" }}>
            {renderWithVariant(variant, size, fullWidth, label)}
          </div>,
        );
        const button = screen.getByRole("button", { name: label }).element() as HTMLElement;
        const span = labelSpan(button);
        const buttonRect = button.getBoundingClientRect();
        const spanRect = span.getBoundingClientRect();

        expect(span.textContent, label).toBe(label);
        expect(span.scrollWidth, label).toBeLessThanOrEqual(span.clientWidth);
        expect(spanRect.left, label).toBeGreaterThanOrEqual(buttonRect.left);
        expect(spanRect.right, label).toBeLessThanOrEqual(buttonRect.right);
        await expectNoAccessibilityViolations(screen.container);
      }
    }
  }
});

test("truncates only once the label's own rendered width passes what the button has for it", async () => {
  const label = "A label with plenty of characters to measure a precise boundary against";

  for (const size of sizes) {
    // A wide container avoids clamping to a shrink-to-fit page; the boundary is computed from
    // this unrounded width, not scrollWidth, which rounds and could hide a near-miss.
    const natural = await render(
      <div style={{ width: "2000px", display: "flex" }}>
        <Button size={size}>{label}</Button>
      </div>,
    );
    const naturalButton = natural.container.querySelector("button") as HTMLElement;
    const naturalSpan = labelSpan(naturalButton);
    const chrome =
      naturalButton.getBoundingClientRect().width - naturalSpan.getBoundingClientRect().width;
    const exactWidth = textNodeRect(naturalSpan.firstChild as ChildNode).width + chrome;

    // 1px of slack: rounding could otherwise read a container exactly at exactWidth as truncated.
    const fits = await render(
      <div style={{ width: `${exactWidth + 1}px`, display: "flex" }}>
        <Button size={size} fullWidth>
          {label}
        </Button>
      </div>,
    );
    const fitsSpan = labelSpan(fits.container.querySelector("button") as HTMLElement);
    expect(fitsSpan.scrollWidth, `${size} fits`).toBeLessThanOrEqual(fitsSpan.clientWidth);
    expect(fitsSpan.textContent, `${size} fits text`).toBe(label);
    await expectNoAccessibilityViolations(fits.container);

    const truncated = await render(
      <div style={{ width: `${exactWidth - 1}px`, display: "flex" }}>
        <Button size={size} fullWidth>
          {label}
        </Button>
      </div>,
    );
    const truncatedSpan = labelSpan(truncated.container.querySelector("button") as HTMLElement);
    expectTruncatedWithEllipsis(truncatedSpan, size);
    await expectNoAccessibilityViolations(truncated.container);
  }
});

test("keeps one line, its exact height, and nothing painted outside it when the label is far too long, for every size and variant, stretched or not", async () => {
  const baseLabel =
    "This label is far longer than any button could ever comfortably hold on a single line, no matter how much room the page is willing to give it";

  for (const { variant, sizes: variantSizeList } of sizesDrawnByVariant) {
    for (const size of variantSizeList) {
      for (const fullWidth of [false, true]) {
        const caseLabel = `${variant} ${size} ${fullWidth ? "stretched" : "content"}`;
        // Suffixed so this case isn't matched by an earlier iteration's still-mounted button.
        const label = `${baseLabel} (${caseLabel})`;
        const oneLine = await render(
          <div style={fullWidth ? fixedWidthRowStyle : { width: "200px" }}>
            {renderWithVariant(variant, size, fullWidth, `Ok (${caseLabel})`)}
          </div>,
        );
        const oneLineHeight = labelSpan(
          oneLine.container.querySelector("button") as HTMLElement,
        ).getBoundingClientRect().height;
        const screen = await render(
          <div style={fullWidth ? fixedWidthRowStyle : { width: "200px" }}>
            {renderWithVariant(variant, size, fullWidth, label)}
          </div>,
        );
        const button = screen.getByRole("button", { name: label }).element() as HTMLElement;
        const span = labelSpan(button);
        const buttonRect = button.getBoundingClientRect();
        const spanRect = span.getBoundingClientRect();

        expect(button.getBoundingClientRect().height, caseLabel).toBeCloseTo(heightBySize[size], 0);
        expect(spanRect.height, `${caseLabel} one line`).toBeCloseTo(oneLineHeight, 0);
        expect(spanRect.top, `${caseLabel} top`).toBeGreaterThanOrEqual(buttonRect.top);
        expect(spanRect.bottom, `${caseLabel} bottom`).toBeLessThanOrEqual(buttonRect.bottom);
        expect(spanRect.left, `${caseLabel} left`).toBeGreaterThanOrEqual(buttonRect.left);
        expect(spanRect.right, `${caseLabel} right`).toBeLessThanOrEqual(buttonRect.right);
        expectTruncatedWithEllipsis(span, caseLabel);
        expect(buttonRect.width, `${caseLabel} width`).toBeLessThanOrEqual(fullWidth ? 500 : 200);
        await expectNoAccessibilityViolations(screen.container);
      }
    }
  }
});

test("keeps its icon at full size while a far too long label shortens next to it", async () => {
  const label =
    "This label is far longer than the button can hold on a single line next to its icon";
  const cases: Array<{ variant: "primary" | "secondary"; icon: ButtonIcon; expectedSize: number }> =
    [
      { variant: "primary", icon: <Check />, expectedSize: 24 },
      { variant: "secondary", icon: <X />, expectedSize: 18 },
    ];

  // Every case shares this label, so each button is read back through its own render's container
  // rather than by role.
  for (const { variant, icon, expectedSize } of cases) {
    const screen = await render(
      <div style={{ width: "200px" }}>
        <Button variant={variant} icon={icon}>
          {label}
        </Button>
      </div>,
    );
    const button = screen.container.querySelector("button") as HTMLElement;
    const iconRect = (button.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
    const span = labelSpan(button);

    expect(iconRect.width, `${variant} icon width`).toBeGreaterThan(expectedSize - 1);
    expect(iconRect.width, `${variant} icon width`).toBeLessThan(expectedSize + 1);
    expect(iconRect.height, `${variant} icon height`).toBeGreaterThan(expectedSize - 1);
    expect(iconRect.height, `${variant} icon height`).toBeLessThan(expectedSize + 1);
    expectTruncatedWithEllipsis(span, variant);
    expect(button.getBoundingClientRect().width, `${variant} width`).toBeLessThanOrEqual(200);
    await expectNoAccessibilityViolations(screen.container);
  }

  const textScreen = await render(
    <div style={{ width: "200px" }}>
      <Button variant="text" tone="destructive">
        {label}
      </Button>
    </div>,
  );
  const textButton = textScreen.container.querySelector("button") as HTMLElement;
  const textIconRect = (textButton.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
  const textSpan = labelSpan(textButton);

  expect(textIconRect.width).toBeGreaterThan(17);
  expect(textIconRect.width).toBeLessThan(19);
  expectTruncatedWithEllipsis(textSpan, "text");
  await expectNoAccessibilityViolations(textScreen.container);
});
