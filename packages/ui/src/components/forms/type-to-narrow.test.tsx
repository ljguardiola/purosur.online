import { useState } from "react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
} from "react-aria-components";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { NoResults, SelectCaret, useTypeToNarrow } from "./type-to-narrow";

type Fruit = "manzana" | "pera" | "limon" | "anana";
type FruitOption = { value: Fruit; label: string; code?: string };

const fruits: readonly FruitOption[] = [
  { value: "manzana", label: "Manzana" },
  { value: "pera", label: "Pera", code: "P-200" },
  { value: "limon", label: "Limón" },
  { value: "anana", label: "Ananá" },
];

type PickerProps = {
  options?: readonly FruitOption[];
  value: Fruit | null;
  onChange?: (value: Fruit) => void;
  matchTexts?: (option: FruitOption) => readonly string[];
};

function Picker({ options = fruits, value, onChange = () => {}, matchTexts }: PickerProps) {
  const { comboBoxProps } = useTypeToNarrow({
    options,
    value,
    onChange,
    ...(matchTexts !== undefined ? { matchTexts } : {}),
  });
  return (
    <AriaComboBox {...comboBoxProps}>
      <AriaLabel>Fruta</AriaLabel>
      <AriaInput />
      <AriaButton>
        <SelectCaret className="size-4" />
      </AriaButton>
      <AriaPopover>
        <AriaListBox renderEmptyState={() => <NoResults />}>
          {(option: FruitOption) => (
            <AriaListBoxItem id={option.value} textValue={option.label}>
              {option.label}
            </AriaListBoxItem>
          )}
        </AriaListBox>
      </AriaPopover>
    </AriaComboBox>
  );
}

function StatefulPicker({
  initial = null,
  onPick,
}: {
  initial?: Fruit | null;
  onPick: (value: Fruit) => void;
}) {
  const [value, setValue] = useState<Fruit | null>(initial);
  return (
    <>
      <Picker
        value={value}
        onChange={(next) => {
          setValue(next);
          onPick(next);
        }}
      />
      <button type="button">Otro</button>
    </>
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

function input(screen: Screen) {
  return screen.getByRole("combobox", { name: "Fruta" });
}

function optionTexts(screen: Screen): string[] {
  return screen
    .getByRole("option")
    .elements()
    .map((el) => el.textContent);
}

test("shows the chosen option's label as the text, and no text while nothing is chosen", async () => {
  const chosen = await render(<Picker value="limon" />);
  await expect.element(input(chosen)).toHaveValue("Limón");
  await chosen.unmount();

  const none = await render(<Picker value={null} />);
  await expect.element(input(none)).toHaveValue("");
});

test("lists every option as soon as the field is focused", async () => {
  const screen = await render(<Picker value={null} />);

  await userEvent.tab();

  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Pera", "Limón", "Ananá"]);
});

test("narrows to the options whose label contains what was typed, ignoring case and accents", async () => {
  const screen = await render(<Picker value={null} />);

  await input(screen).fill("AN");
  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Ananá"]);

  await input(screen).fill("limon");
  await expect.poll(() => optionTexts(screen)).toEqual(["Limón"]);
});

test("matches only the label unless the caller names other texts to match", async () => {
  const byLabel = await render(<Picker value={null} />);
  await input(byLabel).fill("p-200");
  await expect.element(byLabel.getByText("Sin resultados")).toBeVisible();
  await byLabel.unmount();

  const byCode = await render(
    <Picker value={null} matchTexts={(option) => [option.label, option.code ?? ""]} />,
  );
  await input(byCode).fill("p-200");
  await expect.poll(() => optionTexts(byCode)).toEqual(["Pera"]);
});

test("keeps the list open saying Sin resultados when nothing matches", async () => {
  const screen = await render(<Picker value={null} />);

  await input(screen).fill("zzz");

  await expect.element(screen.getByRole("listbox")).toBeVisible();
  expect(optionTexts(screen)).toEqual(["Sin resultados"]);
});

test("gives the caller the picked option's value and shows its label", async () => {
  const onPick = vi.fn();
  const screen = await render(<StatefulPicker onPick={onPick} />);

  await input(screen).fill("pe");
  await screen.getByRole("option", { name: "Pera" }).click();

  expect(onPick).toHaveBeenCalledExactlyOnceWith("pera");
  await expect.element(input(screen)).toHaveValue("Pera");
});

test("lists every option again when reopened after choosing one", async () => {
  const screen = await render(<StatefulPicker initial="pera" onPick={() => {}} />);

  await userEvent.tab();

  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Pera", "Limón", "Ananá"]);
});

test.each([
  ["leaving the field", "{Tab}"],
  ["Escape", "{Escape}"],
  ["Enter with no option highlighted", "{Enter}"],
])(
  "puts the chosen label back, without reporting a change, on %s after typing text that hides it",
  async (_, keys) => {
    const onPick = vi.fn();
    const screen = await render(<StatefulPicker initial="pera" onPick={onPick} />);

    await input(screen).fill("lim");
    await expect.poll(() => optionTexts(screen)).toEqual(["Limón"]);
    await userEvent.keyboard(keys);

    await expect.element(input(screen)).toHaveValue("Pera");
    expect(onPick).not.toHaveBeenCalled();
  },
);

test("puts the chosen label back, without reporting a change, when the text is cleared and the field is left", async () => {
  const onPick = vi.fn();
  const screen = await render(<StatefulPicker initial="pera" onPick={onPick} />);

  await input(screen).clear();
  await userEvent.tab();

  await expect.element(input(screen)).toHaveValue("Pera");
  expect(onPick).not.toHaveBeenCalled();
});

test("leaves the text empty when nothing was chosen and the typed text is abandoned", async () => {
  const screen = await render(<StatefulPicker onPick={() => {}} />);

  await input(screen).fill("lim");
  await userEvent.tab();

  await expect.element(input(screen)).toHaveValue("");
});

test("drops the typed text and shows the new chosen label when the caller changes the value", async () => {
  const screen = await render(<Picker value="pera" />);
  await input(screen).fill("zzz");

  await screen.rerender(<Picker value="limon" />);

  await expect.element(input(screen)).toHaveValue("Limón");
  await userEvent.keyboard("{ArrowDown}");
  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Pera", "Limón", "Ananá"]);
});

test("shows the chosen option's label and lists every option once that option arrives after the value", async () => {
  const withoutLimon = fruits.filter((option) => option.value !== "limon");
  const screen = await render(<Picker value="limon" options={withoutLimon} />);

  await screen.rerender(<Picker value="limon" />);

  await expect.element(input(screen)).toHaveValue("Limón");
  await userEvent.tab();
  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Pera", "Limón", "Ananá"]);
});

test("shows the chosen option's new label and lists every option when its label changes", async () => {
  const screen = await render(<Picker value="limon" />);
  const renamed = fruits.map((option) =>
    option.value === "limon" ? { ...option, label: "Limón sutil" } : option,
  );

  await screen.rerender(<Picker value="limon" options={renamed} />);

  await expect.element(input(screen)).toHaveValue("Limón sutil");
  await userEvent.tab();
  await expect.poll(() => optionTexts(screen)).toEqual(["Manzana", "Pera", "Limón sutil", "Ananá"]);
});

test("points the caret down while the list is closed and up while it is open", async () => {
  const screen = await render(<Picker value={null} />);
  const button = screen.getByRole("button", { name: /Fruta/ }).element();
  const caret = () => button.querySelector("svg");

  expect(caret()?.classList.contains("lucide-chevron-down")).toBe(true);

  await userEvent.tab();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  expect(caret()?.classList.contains("lucide-chevron-up")).toBe(true);
});

test("stays closed when the caller clears the chosen value while the field is focused", async () => {
  const screen = await render(<Picker value="pera" />);
  await userEvent.tab();
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => optionTexts(screen)).toEqual([]);

  await screen.rerender(<Picker value={null} />);

  await expect.element(input(screen)).toHaveValue("");
  await expect.element(input(screen)).toHaveFocus();
  expect(optionTexts(screen)).toEqual([]);
});
