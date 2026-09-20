import { Search } from "lucide-react";
import { useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { boundaryColorHex, rgbToHex, tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { SearchField, type SearchFieldProps } from "./SearchField";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("searchbox", { name }).element() as HTMLInputElement;
}

// The box is the accessible input's own parent: it always holds the input, plus the leading
// icon (a chip in the register variant, bare in the backoffice variant) before it.
function fieldBox(screen: Screen, name: string): HTMLElement {
  return fieldInput(screen, name).parentElement as HTMLElement;
}

function fieldWrapper(screen: Screen, name: string): HTMLElement {
  return fieldBox(screen, name).parentElement as HTMLElement;
}

function SearchFieldHarness(props: Omit<SearchFieldProps, "value" | "onChange">) {
  const [value, setValue] = useState("");
  return <SearchField {...props} value={value} onChange={setValue} />;
}

type VariantCase = {
  variant: SearchFieldProps["variant"];
  height: number;
  paddingX: number;
  gap: number;
  valueFontSize: number;
  leadingSize: number;
  iconSize: number;
};

const variantCases: VariantCase[] = [
  {
    variant: "register",
    height: 64,
    paddingX: 8,
    gap: 16,
    valueFontSize: 20,
    leadingSize: 48,
    iconSize: 26,
  },
  {
    variant: "backoffice",
    height: 44,
    paddingX: 12,
    gap: 8,
    valueFontSize: 14,
    leadingSize: 18,
    iconSize: 18,
  },
];

for (const variantCase of variantCases) {
  test(`renders the ${variantCase.variant} variant at its own height, padding, gap, leading element and placeholder`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variantCase.variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");
    const input = fieldInput(screen, "Scan or type the product name");
    const boxStyle = getComputedStyle(box);
    const inputStyle = getComputedStyle(input);
    const rect = box.getBoundingClientRect();

    expect(rect.height).toBeCloseTo(variantCase.height, 0);
    expect(Math.round(Number.parseFloat(boxStyle.paddingLeft))).toBe(variantCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.paddingRight))).toBe(variantCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.columnGap))).toBe(variantCase.gap);
    expect(Math.round(Number.parseFloat(inputStyle.fontSize))).toBe(variantCase.valueFontSize);
    expect(inputStyle.color).toBe(tokenRgb("ink"));
    expect(input.placeholder).toBe("Scan or type the product name");

    const leading = box.firstElementChild as HTMLElement;
    const leadingRect = leading.getBoundingClientRect();
    expect(leadingRect.width).toBeCloseTo(variantCase.leadingSize, 0);
    expect(leadingRect.height).toBeCloseTo(variantCase.leadingSize, 0);
    expect(leading.getAttribute("aria-hidden")).toBe("true");

    const icon = leading.querySelector("svg") as SVGSVGElement;
    const iconRect = icon.getBoundingClientRect();
    expect(iconRect.width).toBeCloseTo(variantCase.iconSize, 0);
    expect(iconRect.height).toBeCloseTo(variantCase.iconSize, 0);

    await expectNoAccessibilityViolations(screen.container);
  });
}

// The FOCUSED_SHADOW literal is pinned to TextField.test.tsx's own value (see its comment
// there): SearchField reuses that exact border system verbatim, so drifting from it here would
// mean the two components had silently diverged.
const FOCUSED_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgb(51, 79, 96) 0px 0px 0px 3px inset, rgba(79, 108, 126, 0.2) 0px 0px 0px 4px";

for (const variant of ["register", "backoffice"] as const) {
  test(`shows a white box with a 2px ink-secondary border at rest in the ${variant} variant`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");
    const style = getComputedStyle(box);

    expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
    expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
    expect(style.boxShadow).toContain("2px");

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`turns the box bone on hover in the ${variant} variant, keeping the same 2px border`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    await userEvent.hover(box);
    await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
    const style = getComputedStyle(box);
    expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
    expect(style.boxShadow).toContain("2px");

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`shows a 3px blue-strong border and the focus shadow when focused in the ${variant} variant`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    await userEvent.tab();

    await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`keeps the focused border and white fill instead of the hovered bone one when both apply at once in the ${variant} variant`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");
    const input = fieldInput(screen, "Scan or type the product name");

    await userEvent.click(input);
    await userEvent.hover(box);

    await expect
      .poll(() => getComputedStyle(box).boxShadow)
      .toContain(tokenRgb("brand-blue-strong"));
    expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`dims the whole field to 45% opacity and blocks focus when disabled in the ${variant} variant`, async () => {
    const screen = await render(
      <>
        <SearchFieldHarness
          variant={variant}
          placeholder="Scan or type the product name"
          icon={<Search />}
          disabled
        />
        <button type="button">Next control</button>
      </>,
    );
    const wrapper = fieldWrapper(screen, "Scan or type the product name");
    const box = fieldBox(screen, "Scan or type the product name");
    const input = fieldInput(screen, "Scan or type the product name");
    const nextControl = screen.getByRole("button", { name: "Next control" }).element();

    expect(getComputedStyle(wrapper).opacity).toBe("0.45");
    // The box itself still renders the field's ordinary resting look underneath that dimming —
    // it's the wrapper's opacity that communicates "disabled", not a different box appearance.
    expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));
    expect(getComputedStyle(box).boxShadow).toContain(tokenRgb("ink-secondary"));
    expect(getComputedStyle(box).boxShadow).toContain("2px");
    expect(input.disabled).toBe(true);

    await userEvent.tab();
    expect(document.activeElement).toBe(nextControl);
    expect(document.activeElement).not.toBe(input);

    await expectNoAccessibilityViolations(screen.container);
  });
}

// The register's own use of the field: a scan fills it, and once the product is on the sale the
// register empties it for the next one. Rendering the caller's state beside the field, and
// driving the value from there after mount, is what tells a controlled field from an uncontrolled
// one — the input's own value alone reads the same either way, since the DOM keeps it by itself.
function ScanHarness() {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchField
        variant="register"
        value={value}
        onChange={setValue}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />
      <p data-testid="caller-value">{value}</p>
      <button type="button" onClick={() => setValue("")}>
        Add to the sale
      </button>
    </>
  );
}

function callerValue(screen: Screen): string {
  return screen.getByTestId("caller-value").element().textContent ?? "";
}

// A barcode scanner acts as a keyboard sending keystrokes as fast as it can, with no pauses
// between characters the way a person typing would leave.
test("hands a fast barcode-scanner keystroke sequence to its caller whole, and renders the value that caller sends back down", async () => {
  const screen = await render(<ScanHarness />);
  const input = fieldInput(screen, "Scan or type the product name");
  const barcode = "7791234567890";

  await userEvent.click(input);
  await userEvent.keyboard(barcode);

  expect(callerValue(screen)).toBe(barcode);
  expect(input.value).toBe(barcode);

  await userEvent.click(screen.getByRole("button", { name: "Add to the sale" }).element());

  expect(callerValue(screen)).toBe("");
  expect(input.value).toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

test("clears the field and its caller's state when Escape is pressed", async () => {
  const screen = await render(<ScanHarness />);
  const input = fieldInput(screen, "Scan or type the product name");

  await userEvent.click(input);
  await userEvent.keyboard("7791234567890");
  expect(callerValue(screen)).toBe("7791234567890");

  await userEvent.keyboard("{Escape}");

  expect(input.value).toBe("");
  expect(callerValue(screen)).toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

// Neither variant draws a clear button, but the field is a type="search" input, and Chromium
// paints its own ::-webkit-search-cancel-button inside one holding a value — Tailwind's preflight
// resets ::-webkit-search-decoration only. getComputedStyle reports the input's own box for that
// pseudo-element whether or not it is painted, so the only way to tell is to click where it sits:
// the browser's button clears the field, while a click on the text itself only moves the caret.
for (const variant of ["register", "backoffice"] as const) {
  test(`keeps the value when the right edge of the ${variant} variant is clicked, since it draws no clear button`, async () => {
    const screen = await render(
      <SearchFieldHarness
        variant={variant}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const input = fieldInput(screen, "Scan or type the product name");
    const barcode = "7791234567890";

    await userEvent.click(input);
    await userEvent.keyboard(barcode);

    const rect = input.getBoundingClientRect();
    const centerY = Math.round(rect.height / 2);
    for (let inset = 2; inset <= 24; inset += 2) {
      await userEvent.click(input, { position: { x: Math.round(rect.width) - inset, y: centerY } });
      expect(input.value, `after a click ${inset}px from the right edge`).toBe(barcode);
    }

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("is announced as a search field and named by its placeholder when no label is supplied", async () => {
  const screen = await render(
    <SearchFieldHarness
      variant="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );

  const searchbox = screen.getByRole("searchbox", { name: "Scan or type the product name" });
  await expect.element(searchbox).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("is named by the label instead of the placeholder when one is supplied", async () => {
  const screen = await render(
    <SearchFieldHarness
      variant="backoffice"
      placeholder="Filter by name or SKU"
      label="Search products"
      icon={<Search />}
    />,
  );

  const named = screen.getByRole("searchbox", { name: "Search products" });
  await expect.element(named).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Filter by name or SKU" }).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("is a single tab stop", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <SearchFieldHarness
        variant="register"
        placeholder="Scan or type the product name"
        icon={<Search />}
      />
      <button type="button">After</button>
    </>,
  );
  const before = screen.getByRole("button", { name: "Before" }).element();
  const after = screen.getByRole("button", { name: "After" }).element();
  const input = fieldInput(screen, "Scan or type the product name");

  before.focus();
  await userEvent.tab();
  expect(document.activeElement).toBe(input);

  await userEvent.tab();
  expect(document.activeElement).toBe(after);

  await expectNoAccessibilityViolations(screen.container);
});

test("clears the non-text 3:1 contrast minimum between the box's own painted boundary and fill, resting and hovered", async () => {
  const screen = await render(
    <SearchFieldHarness
      variant="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );
  const box = fieldBox(screen, "Scan or type the product name");

  const restingBoundaryHex = boundaryColorHex(box);
  const restingFillHex = rgbToHex(tokenBackgroundColor("surface-white"));
  expect(contrastRatio(restingBoundaryHex, restingFillHex)).toBeGreaterThanOrEqual(
    NON_TEXT_CONTRAST,
  );

  await userEvent.hover(box);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));

  const hoveredBoundaryHex = boundaryColorHex(box);
  const hoveredFillHex = rgbToHex(tokenBackgroundColor("surface-bone"));
  expect(contrastRatio(hoveredBoundaryHex, hoveredFillHex)).toBeGreaterThanOrEqual(
    NON_TEXT_CONTRAST,
  );

  await expectNoAccessibilityViolations(screen.container);
});

// Reads the icon's own painted stroke, not the inherited `color`: getComputedStyle(icon).color
// only reports the color the icon would inherit, which would pass even for an icon that hardcoded
// its own stroke and painted differently — see Button.test.tsx's own icon color tests.
test("paints the register chip icon brand-blue-strong and the backoffice icon ink-secondary", async () => {
  const registerScreen = await render(
    <SearchFieldHarness
      variant="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );
  const registerBox = fieldBox(registerScreen, "Scan or type the product name");
  const registerIcon = registerBox.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(registerIcon).stroke).toBe(tokenRgb("brand-blue-strong"));
  await expectNoAccessibilityViolations(registerScreen.container);
  await registerScreen.unmount();

  const backofficeScreen = await render(
    <SearchFieldHarness
      variant="backoffice"
      placeholder="Filter by name or SKU"
      icon={<Search />}
    />,
  );
  const backofficeBox = fieldBox(backofficeScreen, "Filter by name or SKU");
  const backofficeIcon = backofficeBox.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(backofficeIcon).stroke).toBe(tokenRgb("ink-secondary"));
  await expectNoAccessibilityViolations(backofficeScreen.container);
});

test("does not accept a field without a variant, a value, an onChange, a placeholder or an icon", () => {
  expectTypeOf<{
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    variant: "register";
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    variant: "register";
    value: string;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    variant: "register";
    value: string;
    onChange: (value: string) => void;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    variant: "register";
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }>().not.toExtend<SearchFieldProps>();
});

test("accepts a field with only its required props, and separately with a label", () => {
  expectTypeOf<{
    variant: "backoffice";
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().toExtend<SearchFieldProps>();
  expectTypeOf<{
    variant: "backoffice";
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
    label: string;
  }>().toExtend<SearchFieldProps>();
});

test("fills a chip with brand-blue-message-bg behind the register icon, colored brand-blue-strong", async () => {
  const screen = await render(
    <SearchFieldHarness
      variant="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );
  const box = fieldBox(screen, "Scan or type the product name");
  const chip = box.firstElementChild as HTMLElement;

  expect(getComputedStyle(chip).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(Math.round(Number.parseFloat(getComputedStyle(chip).borderRadius))).toBe(6);

  await expectNoAccessibilityViolations(screen.container);
});
