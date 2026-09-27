import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2 } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../test-support/story-interactions";
import { IconButton } from "./IconButton";

const theButton = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button");

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
  args: {
    "aria-label": "Eliminar fila",
    icon: <Trash2 />,
  },
};

export default meta;

type Story = StoryObj<typeof IconButton>;

export const Default: Story = {};

export const Hovered: Story = {
  play: playHoverSetsDataHovered(theButton),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(theButton),
};

export const Disabled: Story = {
  args: { isDisabled: true },
};

export const LabelledByExternalHeading: Story = {
  render: () => (
    <>
      <span id="delete-row-label">Eliminar fila</span>
      <IconButton aria-labelledby="delete-row-label" icon={<Trash2 />} />
    </>
  ),
};
