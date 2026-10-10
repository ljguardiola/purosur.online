import type { Meta, StoryObj } from "@storybook/react-vite";
import { CountdownRing } from "./countdown-ring";

const meta: Meta<typeof CountdownRing> = {
  title: "Components/CountdownRing",
  component: CountdownRing,
  args: { totalSeconds: 180, label: "Tiempo para pagar" },
};

export default meta;

type Story = StoryObj<typeof CountdownRing>;

export const FullTime: Story = {
  args: { remainingSeconds: 180 },
};

export const PartlyElapsed: Story = {
  args: { remainingSeconds: 161 },
};

export const AlmostOver: Story = {
  args: { remainingSeconds: 9 },
};

export const Over: Story = {
  args: { remainingSeconds: 0 },
};
