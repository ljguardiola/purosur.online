import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriangleAlert, Undo2 } from "lucide-react";
import { ToastStack } from "./toast-stack";

const meta: Meta<typeof ToastStack> = {
  title: "Components/ToastStack",
  component: ToastStack,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", flexDirection: "column", height: "480px" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    children: <div className="flex-1 rounded-lg border border-border bg-surface" />,
  },
};

export default meta;

type Story = StoryObj<typeof ToastStack>;

export const Stacked: Story = {
  args: {
    toasts: [
      {
        id: "refund",
        tone: "success",
        icon: <Undo2 />,
        title: "El cobro quedó como reembolso",
        description: "Se confirma después en el backoffice.",
        onDismiss: () => {},
      },
      {
        id: "refusal",
        tone: "error",
        icon: <TriangleAlert />,
        title: "Todavía falta el tipo de tarjeta de este cobro",
        description:
          "La caja lo consulta sola cuando hay conexión. Probá de nuevo más tarde o pasalo a reembolso.",
        onDismiss: () => {},
      },
    ],
  },
};
