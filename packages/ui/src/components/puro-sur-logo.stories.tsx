import type { Meta, StoryObj } from "@storybook/react-vite";
import { PuroSurLogo } from "./PuroSurLogo";

const meta: Meta<typeof PuroSurLogo> = {
  title: "Components/PuroSurLogo",
  component: PuroSurLogo,
};

export default meta;

type Story = StoryObj<typeof PuroSurLogo>;

export const Default: Story = {};

export const Sized: Story = {
  args: { className: "h-10" },
};
