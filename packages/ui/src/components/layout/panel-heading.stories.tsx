import type { Meta, StoryObj } from "@storybook/react-vite";
import { Undo2, Wallet } from "lucide-react";
import { PanelHeading } from "./panel-heading";

const meta: Meta<typeof PanelHeading> = {
  title: "Components/PanelHeading",
  component: PanelHeading,
  decorators: [
    (Story) => (
      <div className="w-98 bg-surface pb-6">
        <Story />
      </div>
    ),
  ],
  args: { title: "Sesión abierta", icon: <Wallet /> },
};

export default meta;

type Story = StoryObj<typeof PanelHeading>;

export const Neutral: Story = {};

export const Warning: Story = {
  args: { title: "¿Pasar el cobro a reembolso?", icon: <Undo2 />, tone: "warning" },
};
