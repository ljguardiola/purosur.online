import axe from "axe-core";
import { Search } from "lucide-react";
import { useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, paintedBoxShadowLayers, tokenRgb } from "../../test/token-colors";
import { type FieldSize, FieldSizeProvider } from "./field-size";
import { SearchField, type SearchFieldProps } from "./search-field";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("searchbox", { name }).element() as HTMLInputElement;
}

function fieldBox(screen: Screen, name: string): HTMLElement {
  return fieldInput(screen, name).parentElement as HTMLElement;
}

function fieldWrapper(screen: Screen, name: string): HTMLElement {
  return fieldBox(screen, name).parentElement as HTMLElement;
}

function SearchFieldHarness({
  size,
  ...props
}: Omit<SearchFieldProps, "value" | "onChange"> & { size: FieldSize }) {
  const [value, setValue] = useState("");
  return (
    <FieldSizeProvider size={size}>
      <SearchField {...props} value={value} onChange={setValue} />
    </FieldSizeProvider>
  );
}

type SizeCase = {
  size: FieldSize;
  height: number;
  paddingX: number;
  gap: number;
  valueFontSize: number;
  leadingSize: number;
  iconSize: number;
};

const sizeCases: SizeCase[] = [
  {
    size: "register",
    height: 64,
    paddingX: 8,
    gap: 16,
    valueFontSize: 20,
    leadingSize: 48,
    iconSize: 26,
  },
  {
    size: "backoffice",
    height: 44,
    paddingX: 12,
    gap: 8,
    valueFontSize: 14,
    leadingSize: 18,
    iconSize: 18,
  },
];

for (const sizeCase of sizeCases) {
  test(`renders the ${sizeCase.size} size at its own height, padding, gap, leading element and placeholder`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={sizeCase.size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");
    const input = fieldInput(screen, "Scan or type the product name");
    const boxStyle = getComputedStyle(box);
    const inputStyle = getComputedStyle(input);
    const rect = box.getBoundingClientRect();

    expect(rect.height).toBeCloseTo(sizeCase.height, 0);
    expect(boxStyle.borderRadius).toBe("8px");
    expect(Math.round(Number.parseFloat(boxStyle.paddingLeft))).toBe(sizeCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.paddingRight))).toBe(sizeCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.columnGap))).toBe(sizeCase.gap);
    expect(Math.round(Number.parseFloat(inputStyle.fontSize))).toBe(sizeCase.valueFontSize);
    expect(inputStyle.color).toBe(tokenRgb("text"));
    expect(input.placeholder).toBe("Scan or type the product name");
    expect(getComputedStyle(input, "::placeholder").color).toBe(tokenRgb("text-subtle"));

    const leading = box.firstElementChild as HTMLElement;
    const leadingRect = leading.getBoundingClientRect();
    expect(leadingRect.width).toBeCloseTo(sizeCase.leadingSize, 0);
    expect(leadingRect.height).toBeCloseTo(sizeCase.leadingSize, 0);
    expect(leading.getAttribute("aria-hidden")).toBe("true");

    const icon = leading.querySelector("svg") as SVGSVGElement;
    const iconRect = icon.getBoundingClientRect();
    expect(iconRect.width).toBeCloseTo(sizeCase.iconSize, 0);
    expect(iconRect.height).toBeCloseTo(sizeCase.iconSize, 0);
  });
}

function focusedLayers(): string[] {
  return [insetBoundary("action", "2px")];
}

const restBoundaryToken = "border";

for (const size of ["register", "backoffice"] as const) {
  test(`shows a white box with a 2px ${restBoundaryToken} border at rest in the ${size} size`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface"));
    expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary(restBoundaryToken, "2px")]);
  });

  test(`turns the box bone on hover in the ${size} size, keeping the same 2px border`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    await userEvent.hover(box);
    await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-subtle"));
    expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary(restBoundaryToken, "2px")]);
  });

  test(`shows its own focused border when focused in the ${size} size`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    await userEvent.tab();

    await expect.poll(() => paintedBoxShadowLayers(box)).toEqual(focusedLayers());

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`keeps the focused border and white fill instead of the hovered bone one when both apply at once in the ${size} size`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const box = fieldBox(screen, "Scan or type the product name");

    await userEvent.tab();
    await userEvent.hover(box);
    await expect.poll(() => box.matches(":hover")).toBe(true);

    await expect.poll(() => paintedBoxShadowLayers(box)).toEqual(focusedLayers());
    expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`dims the whole field to 45% opacity and blocks focus when disabled in the ${size} size`, async () => {
    const screen = await render(
      <>
        <SearchFieldHarness
          size={size}
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
    expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface"));
    expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary(restBoundaryToken, "2px")]);
    expect(input.disabled).toBe(true);

    await userEvent.tab();
    expect(document.activeElement).toBe(nextControl);
    expect(document.activeElement).not.toBe(input);

    await expectNoAccessibilityViolations(screen.container);
  });
}

function ControlledScanHarness() {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchField
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

test("hands a fast barcode-scanner keystroke sequence to its caller whole, and renders the value that caller sends back down", async () => {
  const screen = await render(<ControlledScanHarness />);
  const input = fieldInput(screen, "Scan or type the product name");
  const barcode = "7791234567890";

  await userEvent.click(input);
  await userEvent.keyboard(barcode);

  expect(callerValue(screen)).toBe(barcode);
  expect(input.value).toBe(barcode);

  await userEvent.click(screen.getByRole("button", { name: "Add to the sale" }).element());

  expect(callerValue(screen)).toBe("");
  expect(input.value).toBe("");
});

test("clears the field and its caller's state when Escape is pressed", async () => {
  const screen = await render(<ControlledScanHarness />);
  const input = fieldInput(screen, "Scan or type the product name");

  await userEvent.fill(input, "7791234567890");
  expect(callerValue(screen)).toBe("7791234567890");

  await userEvent.keyboard("{Escape}");

  expect(input.value).toBe("");
  expect(callerValue(screen)).toBe("");
});

// getComputedStyle can't say whether Chromium's own ::-webkit-search-cancel-button is painted, so
// clicking 8px from the right edge, where it sits, is the only way to tell: it clears the field,
// while the caret alone moves on plain text.
for (const size of ["register", "backoffice"] as const) {
  test(`keeps the value when the right edge of the ${size} size is clicked, since it draws no clear button`, async () => {
    const screen = await render(
      <SearchFieldHarness
        size={size}
        placeholder="Scan or type the product name"
        icon={<Search />}
      />,
    );
    const input = fieldInput(screen, "Scan or type the product name");
    const barcode = "7791234567890";

    await userEvent.fill(input, barcode);

    const rect = input.getBoundingClientRect();
    await userEvent.click(input, {
      position: { x: Math.round(rect.width) - 8, y: Math.round(rect.height / 2) },
    });

    expect(input.value).toBe(barcode);
  });
}

test("is announced as a search field and named by its placeholder when no label is supplied", async () => {
  const screen = await render(
    <SearchFieldHarness
      size="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );

  const searchbox = screen.getByRole("searchbox", { name: "Scan or type the product name" });
  await expect.element(searchbox).toBeVisible();
});

test("is named by the label instead of the placeholder when one is supplied", async () => {
  const screen = await render(
    <SearchFieldHarness
      size="backoffice"
      placeholder="Filter by name or SKU"
      label="Search products"
      icon={<Search />}
    />,
  );

  const named = screen.getByRole("searchbox", { name: "Search products" });
  await expect.element(named).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Filter by name or SKU" }).query()).toBeNull();
});

test("an empty placeholder from a variable, with no label, leaves the field nameless, and the accessibility check catches it", async () => {
  const placeholder: string = "";
  const screen = await render(
    <SearchFieldHarness size="register" placeholder={placeholder} icon={<Search />} />,
  );

  const results = await axe.run(screen.container);
  expect(results.violations.map((violation) => violation.id)).toEqual(["label"]);
});

test("is a single tab stop", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <SearchFieldHarness
        size="register"
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

test("paints the register chip icon's own stroke accent-text and the backoffice icon's subtle-text", async () => {
  const registerScreen = await render(
    <SearchFieldHarness
      size="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );
  const registerBox = fieldBox(registerScreen, "Scan or type the product name");
  const registerIcon = registerBox.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(registerIcon).stroke).toBe(tokenRgb("text-accent"));
  await registerScreen.unmount();

  const backofficeScreen = await render(
    <SearchFieldHarness size="backoffice" placeholder="Filter by name or SKU" icon={<Search />} />,
  );
  const backofficeBox = fieldBox(backofficeScreen, "Filter by name or SKU");
  const backofficeIcon = backofficeBox.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(backofficeIcon).stroke).toBe(tokenRgb("text-subtle"));
});

test("does not accept a field without a value, an onChange, a placeholder or an icon", () => {
  expectTypeOf<{
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    value: string;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    value: string;
    onChange: (value: string) => void;
    icon: SearchFieldProps["icon"];
  }>().not.toExtend<SearchFieldProps>();
  expectTypeOf<{
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }>().not.toExtend<SearchFieldProps>();
});

test("accepts a field with only its required props, and separately with a label", () => {
  expectTypeOf<{
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
  }>().toExtend<SearchFieldProps>();
  expectTypeOf<{
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon: SearchFieldProps["icon"];
    label: string;
  }>().toExtend<SearchFieldProps>();
});

test("fills a chip with the action-subtle fill behind the register icon, colored accent-text", async () => {
  const screen = await render(
    <SearchFieldHarness
      size="register"
      placeholder="Scan or type the product name"
      icon={<Search />}
    />,
  );
  const box = fieldBox(screen, "Scan or type the product name");
  const chip = box.firstElementChild as HTMLElement;

  expect(getComputedStyle(chip).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(Math.round(Number.parseFloat(getComputedStyle(chip).borderRadius))).toBe(6);
});

test("does not name its size as a variant of its own", () => {
  expectTypeOf<SearchFieldProps>().not.toHaveProperty("variant");
});

test("is announced as a combobox that controls its list of suggestions once it is given one", async () => {
  const screen = await render(
    <SearchFieldHarness
      size="register"
      placeholder="Scan or type the product name"
      label="Product"
      icon={<Search />}
      combobox={{ expanded: true, listboxId: "suggestions", activeOptionId: "suggestion-2" }}
    />,
  );

  const combobox = screen.getByRole("combobox", { name: "Product" });
  await expect.element(combobox).toHaveAttribute("aria-expanded", "true");
  await expect.element(combobox).toHaveAttribute("aria-controls", "suggestions");
  await expect.element(combobox).toHaveAttribute("aria-activedescendant", "suggestion-2");
  await expect.element(combobox).toHaveAttribute("aria-autocomplete", "list");
  expect(screen.getByRole("searchbox").query()).toBeNull();
});

test("points at no list and no option while its suggestions are closed", async () => {
  const screen = await render(
    <SearchFieldHarness
      size="register"
      placeholder="Scan or type the product name"
      label="Product"
      icon={<Search />}
      combobox={{ expanded: false, listboxId: "suggestions", activeOptionId: "suggestion-2" }}
    />,
  );

  const combobox = screen.getByRole("combobox", { name: "Product" });
  await expect.element(combobox).toHaveAttribute("aria-expanded", "false");
  await expect.element(combobox).not.toHaveAttribute("aria-controls");
  await expect.element(combobox).not.toHaveAttribute("aria-activedescendant");
  await expectNoAccessibilityViolations(screen.container);
});
