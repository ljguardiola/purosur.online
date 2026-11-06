import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2, X } from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  playHoverShowsNameTooltip,
  playHoverShowsTooltip,
  playTabShowsNameTooltip,
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
  play: playHoverShowsNameTooltip(theButton, "Eliminar fila"),
};

export const FocusVisible: Story = {
  play: playTabShowsNameTooltip(theButton, "Eliminar fila"),
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
  play: playHoverShowsNameTooltip(theButton, "Quitar código"),
};

export const SubtleFocusVisible: Story = {
  args: subtleArgs,
  play: playTabShowsNameTooltip(theButton, "Quitar código"),
};

export const SubtleDisabled: Story = {
  args: { ...subtleArgs, disabled: true },
};

export const DisabledHovered: Story = {
  args: { disabled: true },
  play: playHoverShowsTooltip(theButton, "Eliminar fila"),
};
