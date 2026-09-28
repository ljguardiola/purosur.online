import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info as InfoIcon } from "lucide-react";
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
  args: { tone: "info", title: "Turno abierto", detail: "Se abrió con $10.000 en caja." },
};

export const Warning: Story = {
  args: { tone: "warning", title: "Stock bajo", detail: "Quedan menos de 5 unidades." },
};

export const ErrorTone: Story = {
  args: { tone: "error", title: "Venta bloqueada", detail: "Tarjeta rechazada." },
};
