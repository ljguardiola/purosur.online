import type { Meta, StoryObj } from "@storybook/react-vite";
import { PercentBar } from "./percent-bar";

const meta: Meta<typeof PercentBar> = {
  title: "Components/PercentBar",
  component: PercentBar,
};

export default meta;

type Story = StoryObj<typeof PercentBar>;

export const Empty: Story = {
  args: { value: 0 },
};

export const Partial: Story = {
  args: { value: 0.64 },
};

export const Full: Story = {
  args: { value: 1 },
};
