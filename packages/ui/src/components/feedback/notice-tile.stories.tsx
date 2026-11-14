import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock, CloudOff, Printer, ReceiptText } from "lucide-react";
import { NoticeTile } from "./notice-tile";

const meta: Meta<typeof NoticeTile> = {
  title: "Components/NoticeTile",
  component: NoticeTile,
  decorators: [
    (Story) => (
      <div style={{ width: "352px" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    tone: "warning",
    icon: <Clock />,
    title: "Reloj de la caja desajustado",
    subtitle: "Desde 04/11 · 14:20",
    focused: false,
  },
};

export default meta;

type Story = StoryObj<typeof NoticeTile>;

export const Warning: Story = {};

export const WarningFocused: Story = { args: { focused: true } };

export const ErrorTone: Story = {
  args: {
    tone: "error",
    icon: <CloudOff />,
    title: "La caja no está sincronizando",
    subtitle: "Desde 04/11 · 13:05",
  },
};

export const ErrorFocused: Story = { args: { ...ErrorTone.args, focused: true } };

export const Success: Story = {
  args: {
    tone: "success",
    icon: <Printer />,
    title: "Impresora conectada",
    subtitle: "Desde 04/11 · 13:05",
  },
};

export const Info: Story = {
  args: {
    tone: "info",
    icon: <ReceiptText />,
    title: "Tickets de respaldo",
    subtitle: "3 tickets guardados",
  },
};

export const FocusedWithDetails: Story = {
  args: {
    focused: true,
    description: "La hora de la caja difiere de la de la nube.",
    whatToDo: "Ajustá la hora del sistema.",
  },
};

export const WithoutSubtitle: Story = {
  args: {
    tone: "warning",
    icon: <ReceiptText />,
    title: "Facturación en modo de respaldo",
    subtitle: undefined,
  },
};
