import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProportionBar } from "./proportion-bar";

const meta: Meta<typeof ProportionBar> = {
  title: "Components/ProportionBar",
  component: ProportionBar,
};

export default meta;

type Story = StoryObj<typeof ProportionBar>;

export const Empty: Story = {
  args: { value: 0 },
};

export const Partial: Story = {
  args: { value: 0.6 },
};

export const Full: Story = {
  args: { value: 1 },
};
