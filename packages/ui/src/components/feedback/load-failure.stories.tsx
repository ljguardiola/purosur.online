import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, ShieldX } from "lucide-react";
import { LoadFailure } from "./load-failure";

const meta: Meta<typeof LoadFailure> = {
  title: "Components/LoadFailure",
  component: LoadFailure,
  args: { onRetry: () => {} },
};

export default meta;

type Story = StoryObj<typeof LoadFailure>;

export const Default: Story = {
  args: {
    icon: <CircleAlert />,
    title: "No pudimos abrir los productos",
    description: "Probá de nuevo en unos minutos.",
  },
};

export const RateLimited: Story = {
  args: {
    icon: <ShieldX />,
    title: "Demasiadas solicitudes",
    description: "Probá de nuevo en 30 segundos.",
  },
};
