import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { TextField, type TextFieldProps } from "./TextField";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }).element() as HTMLInputElement;
}

// The box is the accessible input's own parent: it always holds the input, plus an optional
// prefix before it and an optional suffix after it (see TextField.tsx).
function fieldBox(screen: Screen, name: string): HTMLElement {
  return fieldInput(screen, name).parentElement as HTMLElement;
}

function fieldWrapper(screen: Screen, name: string): HTMLElement {
  return fieldBox(screen, name).parentElement as HTMLElement;
}

// The literal box-shadow string Chromium renders for the focused state (3px blue-strong inset
// plus the 4px focus shadow), pinned to the design's own hex values (brand-blue-strong #334f60,
// brand-blue-ui-shadow #4f6c7e33 = blue UI at 20% opacity) rather than read back from the
// component's own class list or from tokens.css: if either of those drifted to a wrong color or
// a wrong pixel value, this fixture would stop matching instead of moving together with it.
// Tailwind v4's shadow utilities always compose five box-shadow layers even when only one or two
// of them carry a real shadow, hence the four transparent placeholder layers ahead of the real
// ones (confirmed once against the actual rendered value, not re-derived from Tailwind's classes).
const FOCUSED_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgb(51, 79, 96) 0px 0px 0px 3px inset, rgba(79, 108, 126, 0.2) 0px 0px 0px 4px";

function describedText(input: HTMLInputElement): string {
  const describedBy = input.getAttribute("aria-describedby");
  if (!describedBy) {
    return "";
  }
  return describedBy
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function AmountHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <TextField
      kind="amount"
      label="Importe"
      value={value}
      onChange={setValue}
      prefix="$"
      helperText="Hay $ 61.900,00 en la caja antes de este retiro."
    />
  );
}

function PlainTextHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TextField kind="plain-text" label="Motivo" value={value} onChange={setValue} />;
}

test("renders the label 6px above an 8px-radius box", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Motivo" value="" onChange={() => {}} />,
  );
  const label = screen.getByText("Motivo").element() as HTMLElement;
  const box = fieldBox(screen, "Motivo");

  const gap = box.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThan(5);
  expect(gap).toBeLessThan(7);
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(box).borderRadius).toBe("8px");

  await expectNoAccessibilityViolations(screen.container);
});

type KindCase = {
  kind: TextFieldProps["kind"];
  label: string;
  height: number;
  paddingX: number;
  gap: number | null;
  valueAlign: "left" | "right";
  valueFontSize: number;
  affix?: { position: "prefix" | "suffix"; content: string; fontSize: number };
};

const kindCases: KindCase[] = [
  {
    kind: "amount",
    label: "Importe",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "counted-cash",
    label: "Efectivo contado",
    height: 80,
    paddingX: 24,
    gap: 12,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "price",
    label: "Precio de venta por kilo",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "prefix", content: "$", fontSize: 32 },
  },
  {
    kind: "weight",
    label: "Peso en kilos",
    height: 64,
    paddingX: 16,
    gap: 8,
    valueAlign: "left",
    valueFontSize: 32,
    affix: { position: "suffix", content: "kg", fontSize: 20 },
  },
  {
    kind: "quantity",
    label: "Cantidad contada",
    height: 72,
    paddingX: 16,
    gap: 8,
    valueAlign: "right",
    valueFontSize: 32,
    affix: { position: "suffix", content: "kg", fontSize: 20 },
  },
  {
    kind: "plain-text",
    label: "Motivo",
    height: 52,
    paddingX: 16,
    gap: null,
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
    if (kindCase.gap !== null) {
      expect(Math.round(Number.parseFloat(boxStyle.columnGap))).toBe(kindCase.gap);
    }
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

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("keeps the same box appearance whether the value is empty or filled", async () => {
  const emptyScreen = await render(renderKind(kindCases[0] as KindCase, ""));
  const emptyBox = fieldBox(emptyScreen, "Importe");
  const emptyShadow = getComputedStyle(emptyBox).boxShadow;
  await emptyScreen.unmount();

  const filledScreen = await render(renderKind(kindCases[0] as KindCase, "60000"));
  const filledBox = fieldBox(filledScreen, "Importe");
  expect(getComputedStyle(filledBox).boxShadow).toBe(emptyShadow);
  expect(fieldInput(filledScreen, "Importe").value).toBe("60000");

  await expectNoAccessibilityViolations(filledScreen.container);
});

test("shows a white box with a 2px ink-secondary border at rest", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Motivo");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(style.boxShadow).toContain("2px");

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the box bone on hover, keeping the same 2px ink-secondary border", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Motivo");

  await userEvent.hover(box);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
  const style = getComputedStyle(box);
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(style.boxShadow).toContain("2px");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a 3px blue-strong border and the focus shadow when focused, as one field in two states", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Motivo");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the focused border instead of the invalid one once an invalid field is focused", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value=""
      onChange={() => {}}
      invalid
      errorMessage="Escribí un motivo."
    />,
  );
  const box = fieldBox(screen, "Motivo");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).boxShadow).toBe(FOCUSED_SHADOW);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the focused border and white fill instead of the hovered bone one when both apply at once", async () => {
  const screen = await render(<PlainTextHarness />);
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");

  await userEvent.click(input);
  await userEvent.hover(box);

  await expect.poll(() => getComputedStyle(box).boxShadow).toContain(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("dims the whole field to 45% opacity and blocks focus when disabled", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Motivo" value="" onChange={() => {}} disabled />,
  );
  const wrapper = fieldWrapper(screen, "Motivo");
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");

  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  // The box itself still renders the field's ordinary resting look underneath that dimming —
  // it's the wrapper's opacity that communicates "disabled", not a different box appearance.
  expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(box).boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(getComputedStyle(box).boxShadow).toContain("2px");
  expect(input.disabled).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).not.toBe(input);

  await expectNoAccessibilityViolations(screen.container);
});

test("lets a read-only field be focused but never typed into, with no hover or focus change", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value="Cierre parcial"
      onChange={onChange}
      readOnly
    />,
  );
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");
  const restingShadow = getComputedStyle(box).boxShadow;
  const restingBackground = getComputedStyle(box).backgroundColor;

  expect(input.readOnly).toBe(true);
  expect(restingBackground).toBe(tokenRgb("surface-bone"));
  // Read-only reuses the same ink-secondary border as resting/hovered, not the softer "line"
  // token: it still marks a control's own boundary and needs the same 3:1 minimum.
  expect(restingShadow).toContain(tokenRgb("ink-secondary"));
  expect(restingShadow).toContain("2px");

  await userEvent.hover(box);
  expect(getComputedStyle(box).boxShadow).toBe(restingShadow);
  expect(getComputedStyle(box).backgroundColor).toBe(restingBackground);

  await userEvent.click(input);
  expect(document.activeElement).toBe(input);
  expect(getComputedStyle(box).boxShadow).toBe(restingShadow);

  // The harness's own value never changes regardless of whether the keystroke was accepted, so
  // asserting the DOM value stayed put wouldn't prove anything a broken read-only couldn't also
  // produce by coincidence. Read-only means the caller is never told about the attempt at all.
  await userEvent.keyboard("x");
  expect(onChange).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("lets disabled win the box treatment over invalid, while still announcing invalid with its message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value=""
      onChange={() => {}}
      disabled
      invalid
      errorMessage="Escribí un motivo."
    />,
  );
  const wrapper = fieldWrapper(screen, "Motivo");
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");
  const style = getComputedStyle(box);

  // Disabled's own white-fill look wins the box, not invalid's error-ui border.
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(style.boxShadow).not.toContain(tokenRgb("status-error-ui"));
  expect(getComputedStyle(wrapper).opacity).toBe("0.45");

  // Assistive technology still hears it as invalid, named by its message, regardless of the box.
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(input)).toContain("Escribí un motivo.");
  // Marks the message itself exempt from WCAG's contrast minimum, the way an inactive
  // component's text already is: dimmed by the field's own 45% opacity, it would otherwise fail
  // it despite being correctly hidden away, not miscolored.
  const errorMessageElement = screen.getByText("Escribí un motivo.").element();
  expect(errorMessageElement.getAttribute("aria-disabled")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets read-only win the box treatment over invalid, while still announcing invalid with its message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value="Cierre parcial"
      onChange={() => {}}
      readOnly
      invalid
      errorMessage="Escribí un motivo."
    />,
  );
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");
  const style = getComputedStyle(box);

  // Read-only's own bone-fill look wins the box, not invalid's error-ui border.
  expect(style.backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(style.boxShadow).not.toContain(tokenRgb("status-error-ui"));

  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(input)).toContain("Escribí un motivo.");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets disabled win the box treatment over read-only when both apply", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value="Cierre parcial"
      onChange={() => {}}
      disabled
      readOnly
    />,
  );
  const wrapper = fieldWrapper(screen, "Motivo");
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");
  const style = getComputedStyle(box);

  // Disabled's white fill wins the box over read-only's bone fill.
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  expect(input.disabled).toBe(true);
  expect(input.readOnly).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).not.toBe(input);

  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required field with an asterisk and exposes it as required", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Motivo" value="" onChange={() => {}} required />,
  );
  const label = screen.getByText("Motivo").element() as HTMLElement;
  // The generated asterisk folds into the input's own accessible name (the browser reads ::after
  // content as part of accname computation), so the plain "Motivo" query used elsewhere in this
  // file wouldn't match here; there is only one textbox in this render.
  const input = screen.getByRole("textbox").element() as HTMLInputElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  expect(input.required).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("replaces the helper line with the field's message and exposes it as invalid, named by that message", async () => {
  const screen = await render(
    <TextField
      kind="plain-text"
      label="Motivo"
      value=""
      onChange={() => {}}
      helperText="No debería verse."
      invalid
      errorMessage="Escribí un motivo."
    />,
  );
  const box = fieldBox(screen, "Motivo");
  const input = fieldInput(screen, "Motivo");
  const style = getComputedStyle(box);

  expect(style.boxShadow).toContain(tokenRgb("status-error-ui"));
  expect(style.boxShadow).toContain("2px");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Escribí un motivo.").element()).toBeTruthy();
  expect(screen.getByText("No debería verse.").query()).toBeNull();
  expect(input.getAttribute("aria-describedby")).toBeTruthy();
  expect(describedText(input)).toContain("Escribí un motivo.");

  await expectNoAccessibilityViolations(screen.container);
});

test("wires the helper text as the input's own description for assistive technology", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Importe");

  expect(input.getAttribute("aria-describedby")).toBeTruthy();
  expect(describedText(input)).toContain("Hay $ 61.900,00 en la caja antes de este retiro.");

  await expectNoAccessibilityViolations(screen.container);
});

test("reports exactly what was typed with the keyboard, unformatted", async () => {
  const screen = await render(<PlainTextHarness />);

  await userEvent.tab();
  await userEvent.keyboard("Cierre parcial del turno");

  expect(fieldInput(screen, "Motivo").value).toBe("Cierre parcial del turno");
  await expectNoAccessibilityViolations(screen.container);
});

test("reports exactly what was typed after clicking into the field with the mouse", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Importe");

  await userEvent.click(input);
  await userEvent.keyboard("1.234,56");

  expect(input.value).toBe("1.234,56");
  await expectNoAccessibilityViolations(screen.container);
});

test("clears a typed value with the keyboard", async () => {
  const screen = await render(<AmountHarness initial="60.000,00" />);
  const input = fieldInput(screen, "Importe");

  await userEvent.click(input);
  await userEvent.keyboard("{Control>}a{/Control}{Backspace}");

  expect(input.value).toBe("");
  await expectNoAccessibilityViolations(screen.container);
});

test("clears a typed value with the mouse", async () => {
  const screen = await render(<AmountHarness initial="60.000,00" />);
  const input = fieldInput(screen, "Importe");

  await userEvent.clear(input);

  expect(input.value).toBe("");
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the amount value right-aligned against its prefix as it grows", async () => {
  const screen = await render(<AmountHarness />);
  const input = fieldInput(screen, "Importe");

  await userEvent.click(input);
  await userEvent.keyboard("60000");

  expect(getComputedStyle(input).textAlign).toBe("right");
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a kind that calls for a prefix without one", () => {
  expectTypeOf<{
    kind: "amount";
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<TextFieldProps>();
});

// Each of these also supplies the affix the kind actually requires, so the only thing that can
// make the candidate fail to extend TextFieldProps is the extra, wrong one — unlike a candidate
// that's missing its own required affix too, which would fail for that reason alone regardless
// of what else is wrong with it.
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

test("does not accept a suffix on the plain text kind", () => {
  expectTypeOf<{
    kind: "plain-text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix: string;
  }>().not.toExtend<TextFieldProps>();
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
