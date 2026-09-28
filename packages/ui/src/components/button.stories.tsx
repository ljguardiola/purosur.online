import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check } from "lucide-react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../test-support/story-interactions";
import { Button } from "./Button";

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
  args: { tone: "destructive", children: "Anular venta" },
};

export const PrimaryDestructiveHovered: Story = {
  args: { tone: "destructive", children: "Anular venta" },
  play: playHoverSetsDataHovered(theButton),
};

export const PrimaryWithIcon: Story = {
  args: { icon: <Check /> },
};

export const PrimaryDisabled: Story = {
  args: { isDisabled: true },
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
  args: { variant: "secondary", tone: "destructive", children: "Desactivar" },
};

export const SecondaryDestructiveHovered: Story = {
  args: { variant: "secondary", tone: "destructive", children: "Desactivar" },
  play: playHoverSetsDataHovered(theButton),
};

export const SecondaryDisabled: Story = {
  args: { variant: "secondary", isDisabled: true, children: "Cancelar" },
};

export const SecondaryHovered: Story = {
  args: { variant: "secondary", children: "Cancelar" },
  play: playHoverSetsDataHovered(theButton),
};

export const TextDestructiveSmall: Story = {
  args: { variant: "text", tone: "destructive", size: "small", children: "Cancelar venta" },
};

export const TextDestructiveLarge: Story = {
  args: { variant: "text", tone: "destructive", size: "large", children: "Cancelar venta" },
};

export const TextDestructiveDisabled: Story = {
  args: { variant: "text", tone: "destructive", isDisabled: true, children: "Cancelar venta" },
};

export const TextDestructiveHovered: Story = {
  args: { variant: "text", tone: "destructive", children: "Cancelar venta" },
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
