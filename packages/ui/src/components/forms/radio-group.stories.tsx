import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { RadioGroup, type RadioOption } from "./radio-group";

type PaymentMethod = "cash" | "card" | "transfer";

const options: [
  RadioOption<PaymentMethod>,
  RadioOption<PaymentMethod>,
  RadioOption<PaymentMethod>,
] = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
];

const meta: Meta<typeof RadioGroup<PaymentMethod>> = {
  title: "Components/RadioGroup",
  component: RadioGroup<PaymentMethod>,
  args: {
    label: "Medio de pago",
    options,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof RadioGroup<PaymentMethod>>;

function radioInput(canvasElement: HTMLElement, name: string): HTMLElement {
  return within(canvasElement).getByRole("radio", { name });
}

function radioRoot(canvasElement: HTMLElement, name: string): HTMLElement {
  return radioInput(canvasElement, name).closest("label") as HTMLElement;
}

export const Default: Story = {
  args: { value: "cash" },
};

export const UnselectedHovered: Story = {
  args: { value: "cash" },
  play: playHoverSetsDataHovered((canvasElement) => radioRoot(canvasElement, "Tarjeta")),
};

export const SelectedHovered: Story = {
  args: { value: "cash" },
  play: playHoverSetsDataHovered((canvasElement) => radioRoot(canvasElement, "Efectivo")),
};

export const FocusVisible: Story = {
  args: { value: "cash" },
  play: playTabReachesFocusVisible(
    (canvasElement) => radioInput(canvasElement, "Efectivo"),
    (canvasElement) => radioRoot(canvasElement, "Efectivo"),
  ),
};

export const Disabled: Story = {
  args: { value: "cash", disabled: true },
};
