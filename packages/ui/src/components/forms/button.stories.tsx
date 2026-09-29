import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { Button } from "./button";

const theButton = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button");

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  args: {
    children: "Guardar",
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

export const PrimarySmall: Story = {
  args: { size: "small" },
};

export const PrimaryLarge: Story = {
  args: { size: "large" },
};

export const PrimarySale: Story = {
  args: { size: "sale", children: "Cobrar" },
};

export const PrimaryDestructive: Story = {
  args: { destructive: true, children: "Anular venta" },
};

export const PrimaryDestructiveHovered: Story = {
  args: { destructive: true, children: "Anular venta" },
  play: playHoverSetsDataHovered(theButton),
};

export const PrimaryWithIcon: Story = {
  args: { icon: <Check /> },
};

export const PrimaryDisabled: Story = {
  args: { disabled: true },
};

export const PrimaryWaitingForData: Story = {
  args: { dataStatus: "loading" },
};

export const PrimaryHovered: Story = {
  play: playHoverSetsDataHovered(theButton),
};

export const PrimaryFocusVisible: Story = {
  play: playTabReachesFocusVisible(theButton),
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Cancelar" },
};

export const SecondaryWithIcon: Story = {
  args: { variant: "secondary", icon: <Check />, children: "Confirmar" },
};

export const SecondaryDestructive: Story = {
  args: { variant: "secondary", destructive: true, children: "Desactivar" },
};

export const SecondaryDestructiveHovered: Story = {
  args: { variant: "secondary", destructive: true, children: "Desactivar" },
  play: playHoverSetsDataHovered(theButton),
};

export const SecondaryDisabled: Story = {
  args: { variant: "secondary", disabled: true, children: "Cancelar" },
};

export const SecondaryHovered: Story = {
  args: { variant: "secondary", children: "Cancelar" },
  play: playHoverSetsDataHovered(theButton),
};

export const TextDestructiveSmall: Story = {
  args: { variant: "text", destructive: true, size: "small", children: "Cancelar venta" },
};

export const TextDestructiveLarge: Story = {
  args: { variant: "text", destructive: true, size: "large", children: "Cancelar venta" },
};

export const TextDestructiveDisabled: Story = {
  args: { variant: "text", destructive: true, disabled: true, children: "Cancelar venta" },
};

export const TextDestructiveHovered: Story = {
  args: { variant: "text", destructive: true, children: "Cancelar venta" },
  play: playHoverSetsDataHovered(theButton),
};

export const FullWidth: Story = {
  args: { fullWidth: true, children: "Confirmar la venta" },
  decorators: [
    (Story) => (
      <div style={{ width: "320px" }}>
        <Story />
      </div>
    ),
  ],
};
