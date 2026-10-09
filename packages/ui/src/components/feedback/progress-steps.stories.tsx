import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressSteps } from "./progress-steps";

const meta: Meta<typeof ProgressSteps> = {
  title: "Components/ProgressSteps",
  component: ProgressSteps,
};

export default meta;

type Story = StoryObj<typeof ProgressSteps>;

export const WaitingForPayment: Story = {
  args: {
    steps: [
      { id: "created", label: "Orden creada por $ 50.700,00", state: "done" },
      {
        id: "waiting",
        label: "Esperando que el cliente pague",
        detail: "Escanea el QR del mostrador con su app",
        state: "current",
      },
      { id: "approved", label: "Pago aprobado", state: "upcoming" },
    ],
  },
};

export const AllDone: Story = {
  args: {
    steps: [
      { id: "created", label: "Orden creada por $ 50.700,00", state: "done" },
      { id: "waiting", label: "Cliente pagó", state: "done" },
      { id: "approved", label: "Pago aprobado", state: "done" },
    ],
  },
};
