import type { Meta, StoryObj } from "@storybook/react-vite";
import { CountdownBar } from "./countdown-bar";

const meta: Meta<typeof CountdownBar> = {
  title: "Components/CountdownBar",
  component: CountdownBar,
  args: { totalSeconds: 3, label: "Tiempo para imprimir" },
  decorators: [
    (Story) => (
      <div style={{ width: "280px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CountdownBar>;

export const FullTime: Story = {
  args: { remainingSeconds: 3 },
};

export const PartlyElapsed: Story = {
  args: { remainingSeconds: 2 },
};

export const Over: Story = {
  args: { remainingSeconds: 0 },
};
