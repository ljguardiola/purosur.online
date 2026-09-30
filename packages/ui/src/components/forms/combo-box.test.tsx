import { useId, useState } from "react";
import { expect, expectTypeOf, onTestFinished, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ComboBox, type ComboBoxOption, type ComboBoxProps } from "./combo-box";
import type { FieldErrorProps } from "./field-error";

type ProductId = "yerba" | "yerba-mini" | "cafe" | "miel";

const options: [ComboBoxOption<ProductId>, ...ComboBoxOption<ProductId>[]] = [
  {
    value: "yerba",
    label: "Yerba mate",
    description: "Playadito · 1 kg",
    searchKeywords: ["7790001", "7790002"],
  },
  {
    value: "yerba-mini",
    label: "Yerba mate",
    description: "Taragüí · 500 g",
    searchKeywords: ["7790003"],
  },
  { value: "cafe", label: "Café molido", searchKeywords: ["7790004"] },
  { value: "miel", label: "Miel de abeja", description: "Campo Real · 350 g" },
];

type BaseProps = Omit<ComboBoxProps<ProductId>, keyof FieldErrorProps>;

function baseProps(overrides: Partial<BaseProps> = {}): BaseProps {
  return {
    label: "Producto",
    options,
    value: null,
    onChange: () => {},
    ...overrides,
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

function input(screen: Screen) {
  return screen.getByRole("combobox", { name: /Producto/ });
}

function inputElement(screen: Screen): HTMLInputElement {
  return input(screen).element() as HTMLInputElement;
}

function optionNames(screen: Screen): string[] {
  return screen
    .getByRole("option")
    .elements()
    .flatMap((el) => el.querySelector('[slot="label"]')?.textContent ?? []);
}

// A locator click scrolls the option into view first, and the scroll event closes a list that does
// not hold the page still.
function activate(element: Element) {
  (element as HTMLElement).click();
}

function Harness(props: Partial<BaseProps> & { onPick?: (value: ProductId) => void }) {
  const { onPick, ...rest } = props;
  const [value, setValue] = useState<ProductId | null>(rest.value ?? null);
  return (
    <ComboBox
      {...baseProps(rest)}
      value={value}
      onChange={(next) => {
        setValue(next);
        onPick?.(next);
      }}
    />
  );
}

test("names the input with the label and shows the chosen option's label as its text", async () => {
  const screen = await render(<ComboBox {...baseProps({ value: "cafe" })} />);

  await expect.element(input(screen)).toBeVisible();
  expect(inputElement(screen).value).toBe("Café molido");
});

test("shows the new chosen option's label when the caller changes the value", async () => {
  const screen = await render(<ComboBox {...baseProps({ value: "cafe" })} />);

  await screen.rerender(<ComboBox {...baseProps({ value: "miel" })} />);

  await expect.poll(() => inputElement(screen).value).toBe("Miel de abeja");
});

test("shows the placeholder while nothing is chosen", async () => {
  const screen = await render(<ComboBox {...baseProps({ placeholder: "Elegí un producto" })} />);

  expect(inputElement(screen).placeholder).toBe("Elegí un producto");
  expect(inputElement(screen).value).toBe("");
});

test("opens on focus listing every option with its description under the label", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await userEvent.tab();

  await expect.element(screen.getByRole("listbox")).toBeVisible();
  expect(input(screen).element().getAttribute("aria-expanded")).toBe("true");
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((el) => el.textContent),
  ).toEqual([
    "Yerba matePlayadito · 1 kg",
    "Yerba mateTaragüí · 500 g",
    "Café molido",
    "Miel de abejaCampo Real · 350 g",
  ]);
});

test("narrows the list to the options whose label contains what was typed", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await input(screen).fill("mie");

  await expect.poll(() => optionNames(screen)).toEqual(["Miel de abeja"]);
});

test("ignores case and accents when narrowing", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await input(screen).fill("CAFE");
  await expect.poll(() => optionNames(screen)).toEqual(["Café molido"]);

  await input(screen).fill("taragui");
  await expect.poll(() => screen.getByRole("option").elements().length).toBe(1);
  expect(screen.getByRole("option").element().textContent).toContain("Taragüí");
});

test("narrows by an option's description", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await input(screen).fill("500 g");

  await expect.poll(() => screen.getByRole("option").elements().length).toBe(1);
  expect(screen.getByRole("option").element().textContent).toContain("Taragüí · 500 g");
});

test("narrows by a search keyword that is never shown", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await input(screen).fill("7790002");

  await expect.poll(() => screen.getByRole("option").elements().length).toBe(1);
  expect(screen.getByRole("option").element().textContent).toContain("Playadito · 1 kg");
  expect(screen.getByText("7790002").query()).toBeNull();
});

test("tells the person nothing matches when the typed text matches no option", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await input(screen).fill("zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(optionNames(screen)).toEqual([]);
});

test("gives the caller the clicked option's value, shows its label and closes the list", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness onPick={onChange} />);

  await input(screen).fill("7790003");
  activate(screen.getByRole("option").element());

  expect(onChange).toHaveBeenCalledExactlyOnceWith("yerba-mini");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  expect(inputElement(screen).value).toBe("Yerba mate");
});

test("picks with the keyboard: type, move down, Enter", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness onPick={onChange} />);

  await input(screen).fill("yerba");
  await expect.poll(() => screen.getByRole("option").elements().length).toBe(2);
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

  expect(onChange).toHaveBeenCalledExactlyOnceWith("yerba-mini");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
});

test("lists every option again when reopened after choosing one", async () => {
  const screen = await render(<Harness value="cafe" />);

  await userEvent.tab();

  await expect.poll(() => screen.getByRole("option").elements().length).toBe(4);
  const chosen = screen.getByRole("option", { name: "Café molido" }).element();
  expect(chosen.getAttribute("aria-selected")).toBe("true");
  expect(chosen.querySelector("svg")).not.toBeNull();
});

test("puts the chosen label back, without reporting a change, when the text is cleared and the field is left", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness value="cafe" onPick={onChange} />);

  await input(screen).clear();
  await userEvent.tab();

  await expect.poll(() => inputElement(screen).value).toBe("Café molido");
  expect(onChange).not.toHaveBeenCalled();
});

test("puts the chosen label back when the typed text is abandoned", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness value="cafe" onPick={onChange} />);

  await input(screen).fill("mie");
  await userEvent.tab();

  await expect.poll(() => inputElement(screen).value).toBe("Café molido");
  expect(onChange).not.toHaveBeenCalled();
});

test("puts the chosen label back, without reporting a change, on Escape after typing text that hides it", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness value="cafe" onPick={onChange} />);

  await input(screen).fill("mie");
  await expect.poll(() => optionNames(screen)).toEqual(["Miel de abeja"]);
  await userEvent.keyboard("{Escape}");

  await expect.poll(() => inputElement(screen).value).toBe("Café molido");
  expect(onChange).not.toHaveBeenCalled();
});

test("puts the chosen label back, without reporting a change, on Enter with no option highlighted after typing text that hides it", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness value="cafe" onPick={onChange} />);

  await input(screen).fill("mie");
  await expect.poll(() => optionNames(screen)).toEqual(["Miel de abeja"]);
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => inputElement(screen).value).toBe("Café molido");
  expect(onChange).not.toHaveBeenCalled();
});

test("leaves the input empty when nothing was chosen and the typed text is abandoned", async () => {
  const screen = await render(<Harness />);

  await input(screen).fill("mie");
  await userEvent.tab();

  await expect.poll(() => inputElement(screen).value).toBe("");
});

test("closes on Escape without choosing anything", async () => {
  const onChange = vi.fn();
  const screen = await render(<ComboBox {...baseProps({ onChange })} />);
  await userEvent.tab();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  expect(onChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
});

test("opens from the chevron button", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);

  await screen.getByRole("button", { name: /Producto/ }).click();

  await expect.element(screen.getByRole("listbox")).toBeVisible();
});

test("points its chevron down while the list is closed and up while it is open", async () => {
  const screen = await render(<ComboBox {...baseProps()} />);
  const button = screen.getByRole("button", { name: /Producto/ }).element();
  const chevron = () => button.querySelector("svg");

  expect(chevron()?.classList.contains("lucide-chevron-down")).toBe(true);

  await userEvent.tab();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  expect(chevron()?.classList.contains("lucide-chevron-up")).toBe(true);
});

test("only puts a small window of a long list in the page, and still finds an option far down it", async () => {
  const many: [ComboBoxOption<string>, ...ComboBoxOption<string>[]] = [
    { value: "p0", label: "Producto 0" },
    ...Array.from({ length: 999 }, (_, index) => ({
      value: `p${index + 1}`,
      label: `Producto ${index + 1}`,
      description: `Marca ${index + 1}`,
    })),
  ];
  const onChange = vi.fn();
  const screen = await render(
    <ComboBox label="Producto" options={many} value={null} onChange={onChange} />,
  );

  await userEvent.tab();

  await expect.element(screen.getByRole("listbox")).toBeVisible();
  const rendered = screen.getByRole("option").elements().length;
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(40);

  await input(screen).fill("Producto 987");
  await expect.poll(() => screen.getByRole("option").elements().length).toBe(1);
  activate(screen.getByRole("option").element());
  expect(onChange).toHaveBeenCalledWith("p987");
});

const withoutDescriptions: [ComboBoxOption<ProductId>, ...ComboBoxOption<ProductId>[]] = [
  { value: "yerba", label: "Yerba mate" },
  { value: "yerba-mini", label: "Yerba mate chica" },
  { value: "cafe", label: "Café molido" },
  { value: "miel", label: "Miel de abeja" },
];

test.each([
  ["with descriptions", options],
  ["without descriptions", withoutDescriptions],
])("keeps its options apart when the page's base font size is larger, %s", async (_, list) => {
  document.documentElement.style.fontSize = "20px";
  onTestFinished(() => {
    document.documentElement.style.fontSize = "";
  });
  const screen = await render(<ComboBox {...baseProps({ options: list })} />);

  await userEvent.tab();

  await expect.poll(() => screen.getByRole("option").elements().length).toBe(4);
  const boxes = screen
    .getByRole("option")
    .elements()
    .map((el) => el.getBoundingClientRect());
  for (const [index, box] of boxes.slice(1).entries()) {
    expect(box.top).toBeGreaterThanOrEqual(boxes[index]?.bottom ?? Number.POSITIVE_INFINITY);
  }
});

const withStatus: [ComboBoxOption<ProductId>, ...ComboBoxOption<ProductId>[]] = [
  { value: "yerba", label: "Yerba mate", status: "Inactivo" },
  { value: "cafe", label: "Café molido" },
];

test("shows the chosen option's status as a tag beside its label", async () => {
  const screen = await render(<ComboBox {...baseProps({ options: withStatus, value: "yerba" })} />);

  await expect.element(screen.getByText("Inactivo")).toBeVisible();
});

test("shows an option's status as a tag in the list, only on the option that has one", async () => {
  const screen = await render(<ComboBox {...baseProps({ options: withStatus })} />);

  await userEvent.tab();

  await expect.element(screen.getByRole("option", { name: /Yerba mate\s*Inactivo/ })).toBeVisible();
  expect(
    screen.getByRole("option", { name: "Café molido" }).getByText("Inactivo").query(),
  ).toBeNull();
});

test("marks a required field with an asterisk and announces it as required", async () => {
  const screen = await render(<ComboBox {...baseProps({ required: true })} />);
  const label = screen.getByText("Producto", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  expect(
    inputElement(screen).required || inputElement(screen).getAttribute("aria-required"),
  ).toBeTruthy();
});

test("shows the description under the field", async () => {
  const screen = await render(
    <ComboBox {...baseProps({ description: "Solo productos activos." })} />,
  );

  await expect.element(screen.getByText("Solo productos activos.")).toBeVisible();
});

test("shows the error message instead of the description and describes the input with it", async () => {
  const screen = await render(
    <ComboBox
      {...baseProps({ description: "Should not be visible." })}
      errorMessage="Elegí un producto."
    />,
  );

  expect(screen.getByText("Should not be visible.").query()).toBeNull();
  const describedBy = inputElement(screen).getAttribute("aria-describedby") ?? "";
  const described = describedBy
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  expect(described).toContain("Elegí un producto.");
  expect(inputElement(screen).getAttribute("aria-invalid")).toBe("true");
});

function ComboBoxWithSharedMessage() {
  const errorId = useId();
  return (
    <>
      <ComboBox {...baseProps()} errorMessageId={errorId} />
      <p id={errorId}>Compartido por otro campo.</p>
    </>
  );
}

test("is described by a shared message rendered outside it", async () => {
  const screen = await render(<ComboBoxWithSharedMessage />);

  const message = screen.getByText("Compartido por otro campo.").element();
  expect(inputElement(screen).getAttribute("aria-describedby")).toContain(message.id);
  expect(inputElement(screen).getAttribute("aria-invalid")).toBe("true");
});

test("draws the error tone on the box while invalid and the focused tone once focused", async () => {
  const screen = await render(<ComboBox {...baseProps()} errorMessage="Elegí un producto." />);
  const box = inputElement(screen).parentElement as HTMLElement;

  expect(getComputedStyle(box).boxShadow).toContain(tokenRgb("error"));

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).boxShadow).toContain(tokenRgb("action"));
});

test("dims the field and cannot be focused when disabled", async () => {
  const screen = await render(
    <>
      <ComboBox {...baseProps({ disabled: true })} />
      <button type="button">Next control</button>
    </>,
  );

  expect(inputElement(screen).disabled).toBe(true);
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next control" }).element(),
  );
});

test("has no accessibility violations closed and open", async () => {
  const screen = await render(<ComboBox {...baseProps({ value: "cafe" })} />);
  await expectNoAccessibilityViolations(screen.container);

  await userEvent.tab();
  await expect.element(screen.getByRole("listbox")).toBeVisible();
  await expectNoAccessibilityViolations(document.body, {
    rules: { region: { enabled: false } },
  });
});

test("paints its open list above a surrounding stacking context that sets a lower positive z-index", async () => {
  const screen = await render(
    <div style={{ position: "relative", zIndex: 50 }}>
      <ComboBox {...baseProps()} />
    </div>,
  );

  await userEvent.tab();
  const option = screen.getByRole("option").first().element() as HTMLElement;
  const rect = option.getBoundingClientRect();

  const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  expect(probe?.closest('[role="option"]')).toBe(option);
});

test("does not accept a field without a label, options, a value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: ProductId;
    onChange: (value: ProductId) => void;
  }>().not.toExtend<ComboBoxProps<ProductId>>();
  expectTypeOf<{
    label: string;
    value: ProductId;
    onChange: (value: ProductId) => void;
  }>().not.toExtend<ComboBoxProps<ProductId>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: ProductId) => void;
  }>().not.toExtend<ComboBoxProps<ProductId>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: ProductId;
  }>().not.toExtend<ComboBoxProps<ProductId>>();
});

test("reports the chosen option's value, never null", () => {
  expectTypeOf<ComboBoxProps<ProductId>["onChange"]>().parameters.toEqualTypeOf<[ProductId]>();
});

test("does not accept both its own error message and a shared one", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: ProductId;
    onChange: (value: ProductId) => void;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<ComboBoxProps<ProductId>>();
});

test("does not accept search keywords that are not text", () => {
  expectTypeOf<{ value: "a"; label: string; searchKeywords: number[] }>().not.toExtend<
    ComboBoxOption<"a">
  >();
});
