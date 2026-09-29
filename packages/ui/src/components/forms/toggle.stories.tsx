import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { Toggle } from "./toggle";

const meta: Meta<typeof Toggle> = {
  title: "Components/Toggle",
  component: Toggle,
  args: {
    children: "Aplicar descuento",
  },
};

export default meta;

type Story = StoryObj<typeof Toggle>;

function toggleInput(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("switch");
}

function toggleRoot(canvasElement: HTMLElement): HTMLElement {
  return toggleInput(canvasElement).closest("label") as HTMLElement;
}

export const Off: Story = {
  args: { checked: false },
};

export const On: Story = {
  args: { checked: true },
};

export const OffHovered: Story = {
  args: { checked: false },
  play: playHoverSetsDataHovered(toggleRoot),
};

export const OnHovered: Story = {
  args: { checked: true },
  play: playHoverSetsDataHovered(toggleRoot),
};

export const FocusVisible: Story = {
  args: { checked: false },
  play: playTabReachesFocusVisible(toggleInput, toggleRoot),
};

export const Disabled: Story = {
  args: { checked: false, disabled: true },
};
