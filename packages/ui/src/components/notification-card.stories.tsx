import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info } from "lucide-react";
import { NotificationCard } from "./NotificationCard";

const meta: Meta<typeof NotificationCard> = {
  title: "Components/NotificationCard",
  component: NotificationCard,
  args: {
    icon: <Info />,
    title: "Venta completada",
    detail: "Se imprimió el comprobante.",
  },
};

export default meta;

type Story = StoryObj<typeof NotificationCard>;

export const Success: Story = {
  args: { tone: "success" },
};

export const Warning: Story = {
  args: { tone: "warning", title: "Sincronización pendiente", detail: "Se reintentará en breve." },
};

export const Error: Story = {
  args: { tone: "error", title: "El pago falló", detail: "Probá de nuevo." },
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
