import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogOut, Undo2 } from "lucide-react";
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

const refundArgs = {
  title: "¿Pasar el cobro a reembolso?",
  icon: <Undo2 />,
  tone: "warning",
  fieldLabel: "Cobro con QR",
  value: "$ 9.200,00",
  details: [
    { label: "Cobrado a las", value: "14:55" },
    { label: "Pasa a ser", value: "Reembolso pendiente" },
  ],
  actionLabel: "Pasar a reembolso",
  actionIcon: <Undo2 />,
} satisfies Story["args"];

export const Refund: Story = { args: refundArgs };

export const WithNotice: Story = {
  args: { ...refundArgs, notice: "No hay conexión con la nube. Probá de nuevo cuando vuelva." },
};

export const Busy: Story = { args: { ...refundArgs, busy: true } };
