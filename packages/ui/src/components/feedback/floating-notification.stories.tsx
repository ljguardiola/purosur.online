import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info as InfoIcon } from "lucide-react";
import { FloatingNotification } from "./floating-notification";

const meta: Meta<typeof FloatingNotification> = {
  title: "Components/FloatingNotification",
  component: FloatingNotification,
  args: {
    icon: <InfoIcon />,
    title: "Precio guardado",
    description: "El nuevo precio ya está vigente.",
    onDismiss: () => {},
  },
  decorators: [
    (Story) => (
      // The notification is fixed to the viewport's corner and takes no room of its own; without
      // a page as tall as the viewport, the catalog's screenshot of the body would crop it away.
      <div style={{ minHeight: "calc(100vh - 2rem)" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof FloatingNotification>;

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
  args: {
    tone: "error",
    title: "No se pudo guardar el precio",
    description: "Probá de nuevo.",
  },
};
