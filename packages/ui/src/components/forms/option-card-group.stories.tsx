import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { OptionCardGroup, type OptionCardOption } from "./option-card-group";

type MovementValue = "income" | "expense" | "withdrawal";

const options: [
  OptionCardOption<MovementValue>,
  OptionCardOption<MovementValue>,
  OptionCardOption<MovementValue>,
] = [
  {
    value: "income",
    icon: <Wallet />,
    title: "Ingreso",
    description: "Dinero que entra a la caja",
  },
  {
    value: "expense",
    icon: <Banknote />,
    title: "Gasto",
    description: "Dinero que sale de la caja",
  },
  {
    value: "withdrawal",
    icon: <CreditCard />,
    title: "Retiro",
    description: "Efectivo retirado para el banco",
  },
];

const meta: Meta<typeof OptionCardGroup<MovementValue>> = {
  title: "Components/OptionCardGroup",
  component: OptionCardGroup<MovementValue>,
  args: {
    label: "Tipo de movimiento",
    options,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof OptionCardGroup<MovementValue>>;

function cardInput(canvasElement: HTMLElement, name: string): HTMLElement {
  return within(canvasElement).getByRole("radio", { name });
}

function cardRoot(canvasElement: HTMLElement, name: string): HTMLElement {
  return cardInput(canvasElement, name).closest("label") as HTMLElement;
}

export const Default: Story = {
  args: { value: "income" },
};

export const NoneSelected: Story = {
  args: { value: null },
};

export const UnselectedHovered: Story = {
  args: { value: "income" },
  play: playHoverSetsDataHovered((canvasElement) => cardRoot(canvasElement, "Gasto")),
};

export const SelectedHovered: Story = {
  args: { value: "income" },
  play: playHoverSetsDataHovered((canvasElement) => cardRoot(canvasElement, "Ingreso")),
};

export const FocusVisible: Story = {
  args: { value: "income" },
  play: playTabReachesFocusVisible(
    (canvasElement) => cardInput(canvasElement, "Ingreso"),
    (canvasElement) => cardRoot(canvasElement, "Ingreso"),
  ),
};

export const Required: Story = {
  args: { value: null, required: true },
};

export const Invalid: Story = {
  args: { value: null, invalid: true, errorMessage: "Elegí una opción." },
};
