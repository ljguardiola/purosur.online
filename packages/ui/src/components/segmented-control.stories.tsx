import type { Meta, StoryObj } from "@storybook/react-vite";
import { Percent, Wallet } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../test-support/story-interactions";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";

type EntryMode = "discount" | "newPrice";

const options: [SegmentedControlOption<EntryMode>, SegmentedControlOption<EntryMode>] = [
  { value: "discount", label: "Descuento", icon: <Percent /> },
  { value: "newPrice", label: "Precio nuevo", icon: <Wallet /> },
];

const meta: Meta<typeof SegmentedControl<EntryMode>> = {
  title: "Components/SegmentedControl",
  component: SegmentedControl<EntryMode>,
  args: {
    label: "Modo de carga",
    options,
    value: "discount",
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SegmentedControl<EntryMode>>;

function segmentInput(canvasElement: HTMLElement, name: string): HTMLElement {
  return within(canvasElement).getByRole("radio", { name });
}

function segmentRoot(canvasElement: HTMLElement, name: string): HTMLElement {
  return segmentInput(canvasElement, name).closest("label") as HTMLElement;
}

export const Medium: Story = {};

export const Large: Story = {
  args: { size: "large" },
};

export const NoIcon: Story = {
  args: {
    options: [
      { value: "discount", label: "Descuento" },
      { value: "newPrice", label: "Precio nuevo" },
    ],
  },
};

export const UnselectedHovered: Story = {
  play: playHoverSetsDataHovered((canvasElement) => segmentRoot(canvasElement, "Precio nuevo")),
};

export const SelectedHovered: Story = {
  play: playHoverSetsDataHovered((canvasElement) => segmentRoot(canvasElement, "Descuento")),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(
    (canvasElement) => segmentInput(canvasElement, "Descuento"),
    (canvasElement) => segmentRoot(canvasElement, "Descuento"),
  ),
};
