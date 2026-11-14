import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ban, Banknote, CreditCard, QrCode, Undo2, Wallet } from "lucide-react";
import { SidePanel } from "./side-panel";
import { SidePanelTitle } from "./side-panel-title";

const meta: Meta<typeof SidePanelTitle> = {
  title: "Components/SidePanelTitle",
  component: SidePanelTitle,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", height: "480px" }}>
        <SidePanel label="Abrir caja" width="wide" header={<Story />}>
          <p className="text-body text-text-subtle">Contenido del panel</p>
        </SidePanel>
      </div>
    ),
  ],
  args: { icon: <Wallet />, title: "Abrir caja" },
};

export default meta;

type Story = StoryObj<typeof SidePanelTitle>;

export const Default: Story = {};

export const Warning: Story = {
  args: {
    icon: <Undo2 />,
    title: "¿Pasar el cobro a reembolso?",
    tone: "warning",
    onClose: () => undefined,
  },
};

export const WithEscape: Story = {
  args: { icon: <Banknote />, title: "Efectivo", onClose: () => {} },
};

export const ErrorTone: Story = {
  args: { icon: <Ban />, title: "Anular venta", tone: "error", onClose: () => {} },
};

export const WithLock: Story = {
  args: { icon: <Ban />, title: "Anular venta", locked: true, onClose: () => {} },
};

export const WithCloseLabel: Story = {
  args: { icon: <QrCode />, title: "QR", onClose: () => {}, closeLabel: "Cambiar de medio" },
};

export const WithCloseLabelAndTwoWordTitle: Story = {
  args: {
    icon: <CreditCard />,
    title: "Point crédito",
    onClose: () => {},
    closeLabel: "Cambiar de medio",
  },
};
