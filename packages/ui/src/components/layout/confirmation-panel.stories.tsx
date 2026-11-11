import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogOut } from "lucide-react";
import { ConfirmationPanel } from "./confirmation-panel";

const meta: Meta<typeof ConfirmationPanel> = {
  title: "Components/ConfirmationPanel",
  component: ConfirmationPanel,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", height: "480px" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "¿Salir de la caja?",
    icon: <LogOut />,
    fieldLabel: "Persona",
    value: "Lucas",
    actionLabel: "Salir",
    actionIcon: <LogOut />,
    onClose: () => {},
    onConfirm: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ConfirmationPanel>;

export const Default: Story = {};
