import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Info as InfoIcon } from "lucide-react";
import { InlineNotice } from "./inline-notice";

const meta: Meta<typeof InlineNotice> = {
  title: "Components/InlineNotice",
  component: InlineNotice,
  args: {
    icon: <InfoIcon />,
  },
};

export default meta;

type Story = StoryObj<typeof InlineNotice>;

export const Info: Story = {
  args: {
    tone: "info",
    title: "Borrador guardado",
    description: "Todavía no hay nada para sincronizar.",
  },
};

export const Success: Story = {
  args: {
    tone: "success",
    icon: <Check />,
    title: "Cambios guardados",
    description: "Todo quedó sincronizado.",
  },
};

export const Warning: Story = {
  args: { tone: "warning", title: "Atención", description: "Revisá los totales antes de cerrar." },
};

export const SeveralLines: Story = {
  args: {
    tone: "warning",
    title: "Atención",
    description: "Revisá los totales antes de cerrar.\nContá el efectivo de la caja.",
  },
};

export const ErrorTone: Story = {
  args: { tone: "error", title: "No se pudo guardar", description: "Probá de nuevo." },
};

export const TitleOnly: Story = {
  args: { tone: "info", title: "Borrador guardado" },
};

export const DetailOnly: Story = {
  args: { tone: "info", description: "Todavía no hay nada para sincronizar." },
};
