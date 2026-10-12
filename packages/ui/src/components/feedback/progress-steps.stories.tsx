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

export const FailedStep: Story = {
  args: {
    steps: [
      { id: "sent", label: "Cobro enviado a la terminal", state: "done" },
      { id: "timeout", label: "Tiempo agotado", state: "error" },
      {
        id: "cancel",
        label: "Esperando la cancelación",
        detail: "Cancelá el cobro en la terminal",
        state: "current",
      },
    ],
  },
};
