import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScaleCard } from "./scale-card";

const meta: Meta<typeof ScaleCard> = {
  title: "Components/ScaleCard",
  component: ScaleCard,
};

export default meta;

type Story = StoryObj<typeof ScaleCard>;

export const Idle: Story = {};

export const Settled: Story = { args: { reading: { value: "0,172 kg", settled: true } } };

export const Moving: Story = { args: { reading: { value: "0,238 kg", settled: false } } };
