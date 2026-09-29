import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info as InfoIcon } from "lucide-react";
import { NotificationCard } from "./notification-card";

const meta: Meta<typeof NotificationCard> = {
  title: "Components/NotificationCard",
  component: NotificationCard,
  args: {
    icon: <InfoIcon />,
    title: "Venta completada",
    description: "Se imprimió el comprobante.",
  },
};

export default meta;

type Story = StoryObj<typeof NotificationCard>;

export const Success: Story = {
  args: { tone: "success" },
};

export const Info: Story = {
  args: {
    tone: "info",
    title: "Nueva versión disponible",
    description: "Se instalará al cerrar el turno.",
  },
};

export const Warning: Story = {
  args: {
    tone: "warning",
    title: "Sincronización pendiente",
    description: "Se reintentará en breve.",
  },
};

export const ErrorTone: Story = {
  args: { tone: "error", title: "El pago falló", description: "Probá de nuevo." },
};

export const WithWhatToDo: Story = {
  args: { tone: "success", whatToDo: "Imprimir otro comprobante" },
};

export const WithTime: Story = {
  args: { tone: "success", time: "14:32" },
};

export const Floating: Story = {
  args: { tone: "success", floating: true },
};
