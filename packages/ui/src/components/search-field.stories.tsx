import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusWithin,
} from "../test-support/story-interactions";
import { SearchField } from "./SearchField";

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
  args: { variant: "register", value: "" },
};

export const RegisterFilled: Story = {
  args: { variant: "register", value: "7791234567890" },
};

export const Backoffice: Story = {
  args: { variant: "backoffice", value: "", placeholder: "Filtrar por nombre o SKU" },
};

export const BackofficeFilled: Story = {
  args: { variant: "backoffice", value: "Miel", placeholder: "Filtrar por nombre o SKU" },
};

export const WithLabel: Story = {
  args: {
    variant: "backoffice",
    value: "",
    placeholder: "Filtrar por nombre o SKU",
    label: "Buscar productos",
  },
};

export const FocusWithin: Story = {
  args: { variant: "register", value: "" },
  play: playTabMatchesCssFocusWithin(fieldInput, fieldBox),
};

export const Hovered: Story = {
  args: { variant: "register", value: "" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const HoveredBackoffice: Story = {
  args: { variant: "backoffice", value: "", placeholder: "Filtrar por nombre o SKU" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const Disabled: Story = {
  args: { variant: "register", value: "", disabled: true },
};
