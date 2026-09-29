import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusWithin,
} from "../../test-support/story-interactions";
import { FieldSizeProvider } from "./field-size";
import { SearchField } from "./search-field";

const meta: Meta<typeof SearchField> = {
  title: "Components/SearchField",
  component: SearchField,
  args: {
    placeholder: "Escanear o escribir el producto",
    icon: <Search />,
    onChange: () => {},
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

type Story = StoryObj<typeof SearchField>;

function fieldBox(canvasElement: HTMLElement): HTMLElement {
  const input = canvasElement.querySelector("input") as HTMLElement;
  return input.parentElement as HTMLElement;
}

function fieldInput(canvasElement: HTMLElement): HTMLElement {
  return canvasElement.querySelector("input") as HTMLElement;
}

export const Register: Story = {
  args: { value: "" },
};

export const RegisterFilled: Story = {
  args: { value: "7791234567890" },
};

const inBackofficeSize: Decorator = (Story) => (
  <FieldSizeProvider size="backoffice">
    <Story />
  </FieldSizeProvider>
);

export const Backoffice: Story = {
  decorators: [inBackofficeSize],
  args: { value: "", placeholder: "Filtrar por nombre o SKU" },
};

export const BackofficeFilled: Story = {
  decorators: [inBackofficeSize],
  args: { value: "Miel", placeholder: "Filtrar por nombre o SKU" },
};

export const WithLabel: Story = {
  decorators: [inBackofficeSize],
  args: {
    value: "",
    placeholder: "Filtrar por nombre o SKU",
    label: "Buscar productos",
  },
};

export const FocusWithin: Story = {
  args: { value: "" },
  play: playTabMatchesCssFocusWithin(fieldInput, fieldBox),
};

export const Hovered: Story = {
  args: { value: "" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const HoveredBackoffice: Story = {
  decorators: [inBackofficeSize],
  args: { value: "", placeholder: "Filtrar por nombre o SKU" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const Disabled: Story = {
  args: { value: "", disabled: true },
};
