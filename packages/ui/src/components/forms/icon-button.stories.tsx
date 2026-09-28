import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2 } from "lucide-react";
import { useId } from "react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { IconButton } from "./icon-button";

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

function IconButtonLabelledByVisibleText() {
  const labelId = useId();
  return (
    <>
      <span id={labelId}>Eliminar fila</span>
      <IconButton aria-labelledby={labelId} icon={<Trash2 />} />
    </>
  );
}

export const LabelledByExternalHeading: Story = {
  render: () => <IconButtonLabelledByVisibleText />,
};
