import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriangleAlert, Undo2 } from "lucide-react";
import { Toast } from "./toast";

const meta: Meta<typeof Toast> = {
  title: "Components/Toast",
  component: Toast,
  args: {
    icon: <Undo2 />,
    title: "El cobro quedó como reembolso",
    description: "Se confirma después en el backoffice.",
    onDismiss: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: { tone: "success" },
};

export const ErrorTone: Story = {
  args: {
    tone: "error",
    icon: <TriangleAlert />,
    title: "Todavía falta el tipo de tarjeta de este cobro",
    description:
      "La caja lo consulta sola cuando hay conexión. Probá de nuevo más tarde o pasalo a reembolso.",
  },
};
