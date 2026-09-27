import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusWithin,
} from "../test-support/story-interactions";
import { FieldSizeProvider } from "./FieldSize";
import { TextField } from "./TextField";

const meta: Meta<typeof TextField> = {
  title: "Components/TextField",
  component: TextField,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TextField>;

function fieldBox(canvasElement: HTMLElement): HTMLElement {
  const input = canvasElement.querySelector("input") as HTMLElement;
  return input.parentElement as HTMLElement;
}

function fieldInput(canvasElement: HTMLElement): HTMLElement {
  return canvasElement.querySelector("input") as HTMLElement;
}

export const Amount: Story = {
  args: { kind: "amount", label: "Monto", value: "", onChange: () => {}, prefix: "$" },
};

export const AmountFilled: Story = {
  args: { kind: "amount", label: "Monto", value: "60000", onChange: () => {}, prefix: "$" },
};

export const CountedCash: Story = {
  args: {
    kind: "counted-cash",
    label: "Efectivo contado",
    value: "",
    onChange: () => {},
    prefix: "$",
  },
};

export const Price: Story = {
  args: {
    kind: "price",
    label: "Precio de venta por kilo",
    value: "",
    onChange: () => {},
    prefix: "$",
  },
};

export const Weight: Story = {
  args: { kind: "weight", label: "Peso en kilos", value: "", onChange: () => {}, suffix: "kg" },
};

export const Quantity: Story = {
  args: {
    kind: "quantity",
    label: "Cantidad contada",
    value: "",
    onChange: () => {},
    suffix: "kg",
  },
};

export const PlainText: Story = {
  args: { kind: "plain-text", label: "Motivo", value: "", onChange: () => {} },
};

export const PlainTextFilled: Story = {
  args: {
    kind: "plain-text",
    label: "Motivo",
    value: "Cierre parcial de turno",
    onChange: () => {},
  },
};

export const PlainTextWithSuffix: Story = {
  args: { kind: "plain-text", label: "Plazo", value: "30", onChange: () => {}, suffix: "días" },
};

export const FocusWithin: Story = {
  args: { kind: "plain-text", label: "Motivo", value: "", onChange: () => {} },
  play: playTabMatchesCssFocusWithin(fieldInput, fieldBox),
};

export const Hovered: Story = {
  args: { kind: "plain-text", label: "Motivo", value: "", onChange: () => {} },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const Invalid: Story = {
  args: {
    kind: "plain-text",
    label: "Motivo",
    value: "",
    onChange: () => {},
    invalid: true,
    errorMessage: "Ingresá un motivo.",
  },
};

export const ReadOnly: Story = {
  args: {
    kind: "plain-text",
    label: "Motivo",
    value: "Cierre parcial de turno",
    onChange: () => {},
    readOnly: true,
  },
};

export const Disabled: Story = {
  args: { kind: "plain-text", label: "Motivo", value: "", onChange: () => {}, disabled: true },
};

export const Required: Story = {
  args: { kind: "plain-text", label: "Motivo", value: "", onChange: () => {}, required: true },
};

export const HelperText: Story = {
  args: {
    kind: "plain-text",
    label: "Motivo",
    value: "",
    onChange: () => {},
    helperText: "No se puede modificar después de guardar.",
  },
};

export const LabelVisuallyHidden: Story = {
  args: {
    kind: "plain-text",
    label: "Buscar producto",
    value: "",
    onChange: () => {},
    labelVisuallyHidden: true,
  },
};

export const Backoffice: Story = {
  args: { kind: "plain-text", label: "Plazo", value: "30", onChange: () => {}, suffix: "días" },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};
