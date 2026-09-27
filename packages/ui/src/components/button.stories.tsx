import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./Button";

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

export const PrimaryWithIcon: Story = {
  args: { icon: <Check /> },
};

export const PrimaryDisabled: Story = {
  args: { isDisabled: true },
};

export const PrimaryHovered: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");

    await userEvent.hover(button);

    await expect(button).toHaveAttribute("data-hovered");
  },
};

export const PrimaryFocusVisible: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");

    await userEvent.tab();

    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("data-focus-visible");
  },
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

export const SecondaryDisabled: Story = {
  args: { variant: "secondary", isDisabled: true, children: "Cancelar" },
};

export const SecondaryHovered: Story = {
  args: { variant: "secondary", children: "Cancelar" },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");

    await userEvent.hover(button);

    await expect(button).toHaveAttribute("data-hovered");
  },
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
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");

    await userEvent.hover(button);

    await expect(button).toHaveAttribute("data-hovered");
  },
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
