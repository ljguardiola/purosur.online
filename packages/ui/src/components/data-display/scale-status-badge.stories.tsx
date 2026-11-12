import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScaleStatusBadge } from "./scale-status-badge";

const meta: Meta<typeof ScaleStatusBadge> = {
  title: "Components/ScaleStatusBadge",
  component: ScaleStatusBadge,
};

export default meta;

type Story = StoryObj<typeof ScaleStatusBadge>;

export const Stable: Story = { args: { status: "stable" } };

export const Moving: Story = { args: { status: "moving" } };
