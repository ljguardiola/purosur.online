import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { Checkbox } from "./checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
  args: {
    children: "Devolver esta línea",
  },
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

function checkboxInput(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("checkbox");
}

function checkboxRoot(canvasElement: HTMLElement): HTMLElement {
  return checkboxInput(canvasElement).closest("label") as HTMLElement;
}

export const Unchecked: Story = {
  args: { isSelected: false },
};

export const Checked: Story = {
  args: { isSelected: true },
};

export const UncheckedHovered: Story = {
  args: { isSelected: false },
  play: playHoverSetsDataHovered(checkboxRoot),
};

export const CheckedHovered: Story = {
  args: { isSelected: true },
  play: playHoverSetsDataHovered(checkboxRoot),
};

export const FocusVisible: Story = {
  args: { isSelected: false },
  play: playTabReachesFocusVisible(checkboxInput, checkboxRoot),
};
