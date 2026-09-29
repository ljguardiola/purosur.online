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
  args: { checked: false },
};

export const Checked: Story = {
  args: { checked: true },
};

export const UncheckedHovered: Story = {
  args: { checked: false },
  play: playHoverSetsDataHovered(checkboxRoot),
};

export const CheckedHovered: Story = {
  args: { checked: true },
  play: playHoverSetsDataHovered(checkboxRoot),
};

export const FocusVisible: Story = {
  args: { checked: false },
  play: playTabReachesFocusVisible(checkboxInput, checkboxRoot),
};

export const Described: Story = {
  args: { checked: false, description: "Lo requiere Hacer recuentos." },
};

export const DisabledChecked: Story = {
  args: { checked: true, disabled: true, description: "Lo requiere Hacer recuentos." },
};
