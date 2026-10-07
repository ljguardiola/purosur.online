import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2, X } from "lucide-react";
import { useId } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
  args: { disabled: true },
};

export const DisabledWithReason: Story = {
  args: { disabledReason: "La venta ya no se puede cambiar porque tiene un pago aprobado." },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(theButton(canvasElement)).toHaveFocus();
    await waitFor(() => {
      expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
    });
  },
};

const subtleArgs = {
  variant: "subtle",
  "aria-label": "Quitar código",
  icon: <X />,
} satisfies Story["args"];

export const Subtle: Story = {
  args: subtleArgs,
};

export const SubtleHovered: Story = {
  args: subtleArgs,
  play: playHoverSetsDataHovered(theButton),
};

export const SubtleFocusVisible: Story = {
  args: subtleArgs,
  play: playTabReachesFocusVisible(theButton),
};

export const SubtleDisabled: Story = {
  args: { ...subtleArgs, disabled: true },
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
