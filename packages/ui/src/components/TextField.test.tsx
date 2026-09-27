import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { insetBoundary, paintedBoxShadowLayers, tokenRgb } from "../test/token-colors";
import { FieldSizeProvider } from "./FieldSize";
import { TextField, type TextFieldProps } from "./TextField";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }).element() as HTMLInputElement;
}

function fieldBox(screen: Screen, name: string): HTMLElement {
  return fieldInput(screen, name).parentElement as HTMLElement;
}

function fieldWrapper(screen: Screen, name: string): HTMLElement {
  return fieldBox(screen, name).parentElement as HTMLElement;
}

// The box-shadow string Chromium renders for the focused state: a 2px brand-blue-ui inset with no
// outer shadow, behind the four transparent layers Tailwind v4 always composes.
const FOCUSED_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgb(79, 108, 126) 0px 0px 0px 2px inset";

function describedText(input: HTMLInputElement): string {
  const describedBy = input.getAttribute("aria-describedby");
  if (!describedBy) {
    return "";
  }
  return describedBy
    .split(" ")
    .map((id) => {
      const element = document.getElementById(id);
      if (element === null) {
        throw new Error(`aria-describedby names "${id}", which is not in the document`);
      }
      return element.textContent ?? "";
    })
    .join(" ");
}

function AmountHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <TextField
      kind="amount"
      label="Amount"
      value={value}
      onChange={setValue}
      prefix="$"
      helperText="There is $ 61.900,00 in the register before this withdrawal."
    />
  );
}

function PlainTextHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TextField kind="plain-text" label="Reason" value={value} onChange={setValue} />;
}

test("renders the label 6px above an 8px-radius box", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Reason" value="" onChange={() => {}} />,
  );
  const label = screen.getByText("Reason").element() as HTMLElement;
  const box = fieldBox(screen, "Reason");

  const gap = box.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThan(5);
  expect(gap).toBeLessThan(7);
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(box).borderRadius).toBe("8px");
});

test("keeps the backoffice plain text value semibold even with a suffix, unlike its own unit", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <TextField kind="plain-text" label="Plazo" value="30" onChange={() => {}} suffix="días" />
    </FieldSizeProvider>,
  );
  const input = fieldInput(screen, "Plazo");
  const suffixElement = screen.getByText("días").element() as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(input).fontSize))).toBe(16);
  expect(getComputedStyle(input).fontWeight).toBe("600");
  expect(getComputedStyle(input).textAlign).toBe("right");
  expect(getComputedStyle(suffixElement).fontWeight).toBe("400");
  expect(getComputedStyle(suffixElement).color).toBe(tokenRgb("ink-secondary"));
});

test("keeps a non-plain-text kind at its own register size inside a backoffice FieldSizeProvider", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <TextField kind="price" label="Sale price per kilo" value="" onChange={() => {}} prefix="$" />
    </FieldSizeProvider>,
  );
  const label = screen.getByText("Sale price per kilo").element() as HTMLElement;
  const input = fieldInput(screen, "Sale price per kilo");
  const box = fieldBox(screen, "Sale price per kilo");
  const wrapper = fieldWrapper(screen, "Sale price per kilo");

  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(6);
  expect(box.getBoundingClientRect().height).toBeCloseTo(72, 0);
  expect(Math.round(Number.parseFloat(getComputedStyle(input).fontSize))).toBe(32);

  await expectNoAccessibilityViolations(screen.container);
});

type KindCase = {
  kind: TextFieldProps["kind"];
  label: string;
  height: number;
  paddingX: number;
  gap: number;
  valueAlign: "left" | "right";
  valueFontSize: number;
  affix?: { position: "prefix" | "suffix"; content: string; fontSize: number };
};

const kindCases: KindCase[] = [
  {
    kind: "amount",
    label: "Amount",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "counted-cash",
    label: "Counted cash",
    height: 80,
    paddingX: 24,
    gap: 12,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "price",
    label: "Sale price per kilo",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "weight",
    label: "Weight in kilos",
    height: 64,
    paddingX: 16,
    gap: 8,
    valueAlign: "left",
    valueFontSize: 32,
    affix: { position: "suffix", content: "kg", fontSize: 20 },
  },
  {
    kind: "quantity",
    label: "Counted quantity",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "suffix", content: "kg", fontSize: 20 },
  },
  {
    kind: "plain-text",
    label: "Reason",
    height: 52,
    paddingX: 16,
    gap: 8,
    valueAlign: "left",
    valueFontSize: 16,
  },
];

function renderKind(kindCase: KindCase, value: string) {
  const common = { label: kindCase.label, value, onChange: () => {} };
  if (kindCase.affix?.position === "prefix") {
    return (
      <TextField kind={kindCase.kind as "amount"} {...common} prefix={kindCase.affix.content} />
    );
  }
  if (kindCase.affix?.position === "suffix") {
    return (
      <TextField kind={kindCase.kind as "weight"} {...common} suffix={kindCase.affix.content} />
    );
  }
  return <TextField kind="plain-text" {...common} />;
}

for (const kindCase of kindCases) {
  test(`renders the ${kindCase.kind} kind at its own height, padding, gap and value alignment`, async () => {
    const screen = await render(renderKind(kindCase, ""));
    const box = fieldBox(screen, kindCase.label);
    const input = fieldInput(screen, kindCase.label);
    const boxStyle = getComputedStyle(box);
    const inputStyle = getComputedStyle(input);
    const rect = box.getBoundingClientRect();

    expect(rect.height).toBeCloseTo(kindCase.height, 0);
    expect(Math.round(Number.parseFloat(boxStyle.paddingLeft))).toBe(kindCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.paddingRight))).toBe(kindCase.paddingX);
    expect(Math.round(Number.parseFloat(boxStyle.columnGap))).toBe(kindCase.gap);
    expect(inputStyle.textAlign).toBe(kindCase.valueAlign);
    expect(Math.round(Number.parseFloat(inputStyle.fontSize))).toBe(kindCase.valueFontSize);
    expect(inputStyle.color).toBe(tokenRgb("ink"));

    if (kindCase.affix) {
      const affixElement = screen.getByText(kindCase.affix.content).element() as HTMLElement;
      const affixStyle = getComputedStyle(affixElement);
      expect(Math.round(Number.parseFloat(affixStyle.fontSize))).toBe(kindCase.affix.fontSize);
      expect(affixStyle.color).toBe(tokenRgb("ink-secondary"));
      expect(affixElement.getAttribute("aria-hidden")).toBe("true");

      const boxChildren = Array.from(box.children);
      const affixIndex = boxChildren.indexOf(affixElement);
      const inputIndex = boxChildren.indexOf(input);
      if (kindCase.affix.position === "prefix") {
        expect(affixIndex).toBeLessThan(inputIndex);
      } else {
        expect(affixIndex).toBeGreaterThan(inputIndex);
      }
    }
  });
}

test("keeps the same box appearance whether the value is empty or filled", async () => {
  const emptyScreen = await render(renderKind(kindCases[0] as KindCase, ""));
  const emptyBox = fieldBox(emptyScreen, "Amount");
  const emptyShadow = getComputedStyle(emptyBox).boxShadow;
  await emptyScreen.unmount();

  const filledScreen = await render(renderKind(kindCases[0] as KindCase, "60000"));
  const filledBox = fieldBox(filledScreen, "Amount");
  expect(getComputedStyle(filledBox).boxShadow).toBe(emptyShadow);
  expect(fieldInput(filledScreen, "Amount").value).toBe("60000");
});

test("shows a white box with a 2px line border at rest", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Reason");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);
});

test("turns the box bone on hover, keeping the same 2px line border", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Reason");

  await userEvent.hover(box);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a 2px brand-blue-ui border with no outer shadow when focused, as one field in two states", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Reason");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);
});

test("shows the focused border instead of the invalid one once an invalid field is focused", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value=""
      onChange={() => {}}
      invalid
      errorMessage="Enter a reason."
    />,
  );
  const box = fieldBox(screen, "Reason");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the invalid box bone on hover, keeping its error border", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value=""
      onChange={() => {}}
      invalid
      errorMessage="Enter a reason."
    />,
  );
  const box = fieldBox(screen, "Reason");

  await userEvent.hover(box);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("status-error-ui", "2px")]);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the focused border and white fill instead of the hovered bone one when both apply at once", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Reason");

  await userEvent.tab();
  await userEvent.hover(box);
  await expect.poll(() => box.matches(":hover")).toBe(true);

  await expect
    .poll(() => getComputedStyle(box).boxShadow)
    .toContain(insetBoundary("brand-blue-ui", "2px"));
  expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("dims the whole field to 45% opacity and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <TextField kind="plain-text" label="Reason" value="" onChange={() => {}} disabled />
      <button type="button">Next control</button>
    </>,
  );
  const wrapper = fieldWrapper(screen, "Reason");
  const box = fieldBox(screen, "Reason");
  const input = fieldInput(screen, "Reason");
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();

  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);
  expect(input.disabled).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(input);
});

test("lets a read-only field be focused and shows it, but is never typed into or hovered", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <>
      <TextField
        kind="plain-text"
        label="Reason"
        value="Partial close"
        onChange={onChange}
        readOnly
      />
      <TextField kind="plain-text" label="Detail" value="" onChange={() => {}} />
    </>,
  );
  const box = fieldBox(screen, "Reason");
  const controlBox = fieldBox(screen, "Detail");
  const input = fieldInput(screen, "Reason");
  const restingShadow = getComputedStyle(box).boxShadow;
  const restingBackground = getComputedStyle(box).backgroundColor;

  expect(input.readOnly).toBe(true);
  expect(restingBackground).toBe(tokenRgb("surface-bone"));
  expect(restingShadow).toContain(insetBoundary("line", "2px"));

  await userEvent.hover(controlBox);
  await expect
    .poll(() => getComputedStyle(controlBox).backgroundColor)
    .toBe(tokenRgb("surface-bone"));

  await userEvent.hover(box);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(restingBackground);
  expect(getComputedStyle(box).boxShadow).toBe(restingShadow);
  expect(getComputedStyle(controlBox).backgroundColor).toBe(tokenRgb("surface-white"));

  await userEvent.click(input);
  expect(document.activeElement).toBe(input);
  await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);
  expect(getComputedStyle(box).backgroundColor).toBe(restingBackground);

  expect(document.activeElement).toBe(input);
  await userEvent.keyboard("x");
  expect(onChange).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("lets disabled win the box treatment over invalid, while still announcing invalid with its message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value=""
      onChange={() => {}}
      disabled
      invalid
      errorMessage="Enter a reason."
    />,
  );
  const wrapper = fieldWrapper(screen, "Reason");
  const box = fieldBox(screen, "Reason");
  const input = fieldInput(screen, "Reason");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);
  expect(getComputedStyle(wrapper).opacity).toBe("0.45");

  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(input)).toContain("Enter a reason.");
  const errorMessageElement = screen.getByText("Enter a reason.").element();
  expect(errorMessageElement.getAttribute("aria-disabled")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the helper text as disabled too when the field itself is disabled", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value=""
      onChange={() => {}}
      helperText="No register is open."
      disabled
    />,
  );
  const input = fieldInput(screen, "Reason");

  expect(describedText(input)).toContain("No register is open.");
  const helperElement = screen.getByText("No register is open.").element();
  expect(helperElement.getAttribute("aria-disabled")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets read-only win the box treatment over invalid, while still announcing invalid with its message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value="Partial close"
      onChange={() => {}}
      readOnly
      invalid
      errorMessage="Enter a reason."
    />,
  );
  const box = fieldBox(screen, "Reason");
  const input = fieldInput(screen, "Reason");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);

  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(input)).toContain("Enter a reason.");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets disabled win the box treatment over read-only when both apply", async () => {
  const screen = await render(
    <>
      <TextField
        kind="plain-text"
        label="Reason"
        value="Partial close"
        onChange={() => {}}
        disabled
        readOnly
      />
      <button type="button">Next control</button>
    </>,
  );
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();
  const wrapper = fieldWrapper(screen, "Reason");
  const box = fieldBox(screen, "Reason");
  const input = fieldInput(screen, "Reason");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);
  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  expect(input.disabled).toBe(true);
  expect(input.readOnly).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(input);

  await expectNoAccessibilityViolations(screen.container);
});

test("describes an invalid money field with both its unit and its message", async () => {
  const screen = await render(
    <TextField
      kind="amount"
      label="Amount"
      value=""
      onChange={() => {}}
      prefix="$"
      invalid
      errorMessage="Enter an amount."
    />,
  );
  const input = fieldInput(screen, "Amount");
  const described = describedText(input);

  expect(described).toContain("$");
  expect(described).toContain("Enter an amount.");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required field with an asterisk and exposes it as required", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Reason" value="" onChange={() => {}} required />,
  );
  const label = screen.getByText("Reason").element() as HTMLElement;
  // A CSS-generated ::after asterisk folds into the accessible name, so the plain "Reason" query
  // used elsewhere wouldn't match here.
  const input = screen.getByRole("textbox").element() as HTMLInputElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  expect(input.required).toBe(true);
});

test("names the field by an external heading through labelledBy, while the visible label stays its own text", async () => {
  const screen = await render(
    <>
      <p id="group-heading">Lunes a viernes</p>
      <TextField
        kind="plain-text"
        label="Abre"
        value=""
        onChange={() => {}}
        labelledBy="group-heading"
      />
    </>,
  );

  await expect.element(screen.getByText("Abre")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Lunes a viernes Abre" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Abre", exact: true }).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label as the accessible name but paints nothing when labelVisuallyHidden", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Lunes, horario 1, abre"
      value=""
      onChange={() => {}}
      labelVisuallyHidden
    />,
  );
  const input = screen.getByRole("textbox", { name: "Lunes, horario 1, abre" });
  await expect.element(input).toBeVisible();
  const label = screen.getByText("Lunes, horario 1, abre").element() as HTMLElement;
  const labelRect = label.getBoundingClientRect();

  expect(labelRect.width).toBeLessThanOrEqual(1);
  expect(labelRect.height).toBeLessThanOrEqual(1);
});

test("shows the label as an ordinary visible caption when labelVisuallyHidden is left out", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Reason" value="" onChange={() => {}} />,
  );
  const label = screen.getByText("Reason").element() as HTMLElement;
  const labelRect = label.getBoundingClientRect();

  expect(labelRect.width).toBeGreaterThan(1);
  expect(labelRect.height).toBeGreaterThan(1);
});

test("exposes the field as invalid, described by a shared message rendered outside it through errorMessageId", async () => {
  const screen = await render(
    <>
      <TextField
        kind="plain-text"
        label="Opens"
        value=""
        onChange={() => {}}
        helperText="Should not be visible."
        invalid
        errorMessageId="day-error"
      />
      <p id="day-error">Enter the time as 9:00.</p>
    </>,
  );
  const box = fieldBox(screen, "Opens");
  const input = fieldInput(screen, "Opens");

  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("status-error-ui", "2px")]);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(input)).toBe("Enter the time as 9:00.");
  expect(screen.getByText("Should not be visible.").query()).toBeNull();
  expect(fieldWrapper(screen, "Opens").textContent).toBe("Opens");

  await expectNoAccessibilityViolations(screen.container);
});

test("describes an invalid field by both its suffix and the shared message errorMessageId names", async () => {
  const screen = await render(
    <>
      <TextField
        kind="plain-text"
        label="Days"
        value=""
        onChange={() => {}}
        suffix="días"
        invalid
        errorMessageId="group-error"
      />
      <p id="group-error">Enter a number.</p>
    </>,
  );
  const described = describedText(fieldInput(screen, "Days"));

  expect(described).toContain("días");
  expect(described).toContain("Enter a number.");
});

test("replaces the helper line with the field's message and exposes it as invalid, named by that message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Reason"
      value=""
      onChange={() => {}}
      helperText="Should not be visible."
      invalid
      errorMessage="Enter a reason."
    />,
  );
  const box = fieldBox(screen, "Reason");
  const input = fieldInput(screen, "Reason");

  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("status-error-ui", "2px")]);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Enter a reason.").element()).toBeTruthy();
  expect(screen.getByText("Should not be visible.").query()).toBeNull();
  expect(input.getAttribute("aria-describedby")).toBeTruthy();
  expect(describedText(input)).toContain("Enter a reason.");
});

test("wires the helper text as the input's own description for assistive technology", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Amount");

  expect(input.getAttribute("aria-describedby")).toBeTruthy();
  expect(describedText(input)).toContain(
    "There is $ 61.900,00 in the register before this withdrawal.",
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("wires the money prefix into the input's own description for assistive technology", async () => {
  const screen = await render(
    <TextField kind="amount" label="Amount" value="" onChange={() => {}} prefix="$" />,
  );
  const input = fieldInput(screen, "Amount");
  const prefixElement = screen.getByText("$").element();

  expect(describedText(input)).toContain("$");
  expect(prefixElement.getAttribute("aria-hidden")).toBe("true");
});

test("renders an optional suffix on the plain text kind at its own text-base scale, exposed in its description", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Plazo" value="30" onChange={() => {}} suffix="días" />,
  );
  const box = fieldBox(screen, "Plazo");
  const input = fieldInput(screen, "Plazo");
  const suffixElement = screen.getByText("días").element() as HTMLElement;
  const suffixStyle = getComputedStyle(suffixElement);

  expect(box.getBoundingClientRect().height).toBeCloseTo(52, 0);
  expect(getComputedStyle(input).textAlign).toBe("right");
  expect(Math.round(Number.parseFloat(getComputedStyle(box).columnGap))).toBe(8);
  expect(Math.round(Number.parseFloat(suffixStyle.fontSize))).toBe(16);
  expect(suffixStyle.color).toBe(tokenRgb("ink-secondary"));
  expect(suffixElement.getAttribute("aria-hidden")).toBe("true");
  expect(describedText(input)).toContain("días");
});

test("wires the kg suffix into the input's own description for assistive technology", async () => {
  const screen = await render(
    <TextField kind="weight" label="Weight in kilos" value="" onChange={() => {}} suffix="kg" />,
  );
  const input = fieldInput(screen, "Weight in kilos");
  const suffixElement = screen.getByText("kg").element();

  expect(describedText(input)).toContain("kg");
  expect(suffixElement.getAttribute("aria-hidden")).toBe("true");
});

test("keeps the affix in the description alongside the helper text, each named once", async () => {
  const screen = await render(
    <TextField
      kind="weight"
      label="Weight in kilos"
      value=""
      onChange={() => {}}
      suffix="kg"
      helperText="Weigh with the scale empty."
    />,
  );
  const input = fieldInput(screen, "Weight in kilos");
  const described = describedText(input);

  expect(described).toContain("kg");
  expect(described).toContain("Weigh with the scale empty.");
  const describedBy = input.getAttribute("aria-describedby") as string;
  const ids = describedBy.split(" ");
  expect(ids).toHaveLength(new Set(ids).size);

  await expectNoAccessibilityViolations(screen.container);
});

test("follows the field's description as it moves from helper text to an error and back", async () => {
  function ValidityHarness() {
    const [invalid, setInvalid] = useState(false);
    return (
      <>
        {invalid ? (
          <TextField
            kind="plain-text"
            label="Reason"
            value=""
            onChange={() => {}}
            helperText="Optional."
            invalid
            errorMessage="Enter a reason."
          />
        ) : (
          <TextField
            kind="plain-text"
            label="Reason"
            value=""
            onChange={() => {}}
            helperText="Optional."
          />
        )}
        <button type="button" onClick={() => setInvalid((current) => !current)}>
          Toggle
        </button>
      </>
    );
  }

  const screen = await render(<ValidityHarness />);
  const input = fieldInput(screen, "Reason");
  const toggle = screen.getByRole("button", { name: "Toggle" }).element() as HTMLButtonElement;

  expect(describedText(input)).toContain("Optional.");

  await userEvent.click(toggle);
  await expect.poll(() => describedText(input)).toContain("Enter a reason.");
  expect(describedText(input)).not.toContain("Optional.");

  await userEvent.click(toggle);
  await expect.poll(() => describedText(input)).toContain("Optional.");
  expect(describedText(input)).not.toContain("Enter a reason.");

  await expectNoAccessibilityViolations(screen.container);
});

test("reports exactly what was typed with the keyboard, unformatted", async () => {
  const screen = await render(<PlainTextHarness />);

  await userEvent.tab();
  await userEvent.keyboard("Partial close of the shift");

  expect(fieldInput(screen, "Reason").value).toBe("Partial close of the shift");
});

test("reports exactly what was typed after clicking into the field with the mouse", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Amount");

  await userEvent.click(input);
  await userEvent.keyboard("1.234,56");

  expect(input.value).toBe("1.234,56");
});

test("clears a typed value with the keyboard", async () => {
  const screen = await render(<AmountHarness initial="60.000,00" />);
  const input = fieldInput(screen, "Amount");

  await userEvent.click(input);
  await userEvent.keyboard("{Control>}a{/Control}{Backspace}");

  expect(input.value).toBe("");
});

test("clears a typed value with the mouse", async () => {
  const screen = await render(<AmountHarness initial="60.000,00" />);
  const input = fieldInput(screen, "Amount");

  await userEvent.clear(input);

  expect(input.value).toBe("");
});

test("keeps the amount value right-aligned against its prefix as it grows", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Amount");

  await userEvent.click(input);
  await userEvent.keyboard("60000");

  expect(getComputedStyle(input).textAlign).toBe("right");
});

test("does not accept a kind that calls for a prefix without one", () => {
  expectTypeOf<{
    kind: "amount";
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<TextFieldProps>();
});

// Each candidate below also supplies the affix its kind requires, so only the extra, wrong affix
// can make it fail to extend TextFieldProps, not a missing required one.
test("does not accept a suffix on a money kind that already has its own prefix", () => {
  expectTypeOf<{
    kind: "amount";
    label: string;
    value: string;
    onChange: (value: string) => void;
    prefix: string;
    suffix: string;
  }>().not.toExtend<TextFieldProps>();
});

test("does not accept a prefix on a kg kind that already has its own suffix", () => {
  expectTypeOf<{
    kind: "weight";
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix: string;
    prefix: string;
  }>().not.toExtend<TextFieldProps>();
});

test("does not accept a prefix on the plain text kind", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    prefix: string;
  }>().not.toExtend<TextFieldProps>();
});

test("accepts an optional suffix on the plain text kind", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix: string;
  }>().toExtend<TextFieldProps>();
});

test("accepts each kind with exactly the affix it calls for", () => {
  expectTypeOf<{
    kind: "amount";
    label: string;
    value: string;
    onChange: (value: string) => void;
    prefix: string;
  }>().toExtend<TextFieldProps>();
  expectTypeOf<{
    kind: "weight";
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix: string;
  }>().toExtend<TextFieldProps>();
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().toExtend<TextFieldProps>();
});

test("does not accept an invalid field without an error message", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    invalid: true;
  }>().not.toExtend<TextFieldProps>();
});

test("does not accept an invalid field with both its own message and a shared one", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    invalid: true;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<TextFieldProps>();
});

test("does not accept a shared error message id on a field that isn't invalid", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    errorMessageId: string;
  }>().not.toExtend<TextFieldProps>();
});

test("accepts an invalid field whose message is shared through errorMessageId", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    invalid: true;
    errorMessageId: string;
  }>().toExtend<TextFieldProps>();
});

test("does not accept a field without a label, a value or onChange", () => {
  expectTypeOf<{
    kind: "plain-text";
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<TextFieldProps>();
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    onChange: (value: string) => void;
  }>().not.toExtend<TextFieldProps>();
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
  }>().not.toExtend<TextFieldProps>();
});
