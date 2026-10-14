import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIndicatorButton } from "./status-indicator-button";

const meta: Meta<typeof StatusIndicatorButton> = {
  title: "Components/StatusIndicatorButton",
  component: StatusIndicatorButton,
};

export default meta;

type Story = StoryObj<typeof StatusIndicatorButton>;

export const Warning: Story = {
  args: { tone: "warning", children: "1 aviso" },
};

export const ErrorTone: Story = {
  args: { tone: "error", children: "3 avisos" },
};
