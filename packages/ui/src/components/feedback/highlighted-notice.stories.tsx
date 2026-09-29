import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Info as InfoIcon } from "lucide-react";
import { HighlightedNotice } from "./highlighted-notice";

const meta: Meta<typeof HighlightedNotice> = {
  title: "Components/HighlightedNotice",
  component: HighlightedNotice,
  args: {
    icon: <InfoIcon />,
  },
};

export default meta;

type Story = StoryObj<typeof HighlightedNotice>;

export const Info: Story = {
  args: { tone: "info", title: "Turno abierto", description: "Se abrió con $10.000 en caja." },
};

export const Success: Story = {
  args: {
    tone: "success",
    icon: <Check />,
    title: "Turno cerrado",
    description: "La caja cuadró sin diferencias.",
  },
};

export const Warning: Story = {
  args: { tone: "warning", title: "Stock bajo", description: "Quedan menos de 5 unidades." },
};

export const ErrorTone: Story = {
  args: { tone: "error", title: "Venta bloqueada", description: "Tarjeta rechazada." },
};
