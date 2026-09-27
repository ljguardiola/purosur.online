import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  playClickExpandsTrigger,
  playTabMatchesCssFocusWithin,
} from "../test-support/story-interactions";
import { QuantityUnitField, type QuantityUnitFieldOption } from "./QuantityUnitField";

type Unit = "g" | "kg" | "ml" | "l" | "u";

const unitOptions: [QuantityUnitFieldOption<Unit>, ...QuantityUnitFieldOption<Unit>[]] = [
  { id: "g", label: "g" },
  { id: "kg", label: "kg" },
  { id: "ml", label: "ml" },
  { id: "l", label: "l" },
  { id: "u", label: "u" },
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

export const UnitOpen: Story = {
  args: { quantity: "380" },
  play: playClickExpandsTrigger(unitTrigger),
};

export const Invalid: Story = {
  args: { quantity: "", invalid: true, errorMessage: "Ingresá una cantidad válida." },
};

export const Disabled: Story = {
  args: { quantity: "", disabled: true },
};

export const HelperText: Story = {
  args: { quantity: "", helperText: "Nunca afecta el precio ni el stock." },
};
