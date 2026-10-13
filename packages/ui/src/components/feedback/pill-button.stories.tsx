import type { Meta, StoryObj } from "@storybook/react-vite";
import { RotateCw } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { PillButton } from "./pill-button";

function button(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button");
}

const meta: Meta<typeof PillButton> = {
  title: "Components/PillButton",
  component: PillButton,
  args: {
    tone: "error",
    icon: <RotateCw />,
    children: "No se cargaron las alertas",
    "aria-label": "No se cargaron las alertas. Reintentar",
    onPress: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof PillButton>;

export const ErrorTone: Story = {};

export const Warning: Story = {
  args: { tone: "warning", children: "Revisar", "aria-label": "Revisar" },
};

export const Hovered: Story = {
  play: playHoverSetsDataHovered(button),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(button),
};
