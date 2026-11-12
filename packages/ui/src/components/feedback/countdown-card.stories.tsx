import type { Meta, StoryObj } from "@storybook/react-vite";
import { CountdownCard } from "./countdown-card";

const meta: Meta<typeof CountdownCard> = {
  title: "Components/CountdownCard",
  component: CountdownCard,
  args: { totalSeconds: 180, label: "Tiempo para pagar" },
  decorators: [
    (Story) => (
      <div style={{ width: 352 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CountdownCard>;

export const FullTime: Story = {
  args: { remainingSeconds: 180 },
};

export const PartlyElapsed: Story = {
  args: { remainingSeconds: 102 },
};

export const Over: Story = {
  args: { remainingSeconds: 0, tone: "error" },
};
