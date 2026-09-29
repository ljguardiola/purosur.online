import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import { useId } from "react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { fieldErrorClassName } from "./field-styles";
import type { NarrowedOption } from "./option";
import { OptionCardGroup } from "./option-card-group";

type MovementValue = "income" | "expense" | "withdrawal";

const options: [
  NarrowedOption<MovementValue, "description" | "icon">,
  NarrowedOption<MovementValue, "description" | "icon">,
  NarrowedOption<MovementValue, "description" | "icon">,
] = [
  {
    value: "income",
    icon: <Wallet />,
    label: "Ingreso",
    description: "Dinero que entra a la caja",
  },
  {
    value: "expense",
    icon: <Banknote />,
    label: "Gasto",
    description: "Dinero que sale de la caja",
  },
  {
    value: "withdrawal",
    icon: <CreditCard />,
    label: "Retiro",
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
  args: { value: null, errorMessage: "Elegí una opción." },
};

function OptionCardGroupWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <OptionCardGroup
        label="Tipo de movimiento"
        options={options}
        value={null}
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí una opción.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <OptionCardGroupWithMessageElsewhere />,
};
