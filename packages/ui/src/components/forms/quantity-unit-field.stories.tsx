import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import {
  playArrowKeyFocusesListboxOption,
  playClickExpandsTrigger,
  playHoverListboxOption,
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusWithin,
} from "../../test-support/story-interactions";
import { fieldErrorClassName } from "./field-styles";
import type { Option } from "./option";
import { QuantityUnitField } from "./quantity-unit-field";

type Unit = "g" | "kg" | "ml" | "l" | "u";

const unitOptions: [Option<Unit>, ...Option<Unit>[]] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "u", label: "u" },
];

const meta: Meta<typeof QuantityUnitField<Unit>> = {
  title: "Components/QuantityUnitField",
  component: QuantityUnitField<Unit>,
  args: {
    label: "Contenido neto",
    unit: "g",
    onQuantityChange: () => {},
    onUnitChange: () => {},
    options: unitOptions,
    unitLabel: "Unidad",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof QuantityUnitField<Unit>>;

function quantityInput(canvasElement: HTMLElement): HTMLElement {
  return canvasElement.querySelector("input") as HTMLElement;
}

function fieldBox(canvasElement: HTMLElement): HTMLElement {
  return quantityInput(canvasElement).parentElement as HTMLElement;
}

function unitTrigger(canvasElement: HTMLElement): HTMLElement {
  return canvasElement.querySelector("button") as HTMLElement;
}

export const Default: Story = {
  args: { quantity: "" },
};

export const Filled: Story = {
  args: { quantity: "380" },
};

export const FocusWithin: Story = {
  args: { quantity: "" },
  play: playTabMatchesCssFocusWithin(quantityInput, fieldBox),
};

export const Hovered: Story = {
  args: { quantity: "" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const UnitOpen: Story = {
  args: { quantity: "380" },
  play: playClickExpandsTrigger(unitTrigger),
};

export const UnitOptionHovered: Story = {
  args: { quantity: "380" },
  play: playHoverListboxOption(unitTrigger, "kg"),
};

export const UnitOptionFocusVisible: Story = {
  args: { quantity: "380" },
  play: playArrowKeyFocusesListboxOption(unitTrigger, "kg"),
};

export const Invalid: Story = {
  args: { quantity: "", errorMessage: "Ingresá una cantidad válida." },
};

function QuantityUnitFieldWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <QuantityUnitField
        label="Contenido neto"
        quantity=""
        onQuantityChange={() => {}}
        unit="g"
        onUnitChange={() => {}}
        options={unitOptions}
        unitLabel="Unidad"
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Ingresá una cantidad válida.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <QuantityUnitFieldWithMessageElsewhere />,
};

export const Disabled: Story = {
  args: { quantity: "", disabled: true },
};

export const HelperText: Story = {
  args: { quantity: "", description: "Nunca afecta el precio ni el stock." },
};
