import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info as InfoIcon } from "lucide-react";
import { InlineNotice } from "./InlineNotice";

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
  args: { tone: "info", title: "Borrador guardado", detail: "Todavía no hay nada para sincronizar." },
};

export const Warning: Story = {
  args: { tone: "warning", title: "Atención", detail: "Revisá los totales antes de cerrar." },
};

export const Error: Story = {
  args: { tone: "error", title: "No se pudo guardar", detail: "Probá de nuevo." },
};

export const TitleOnly: Story = {
  args: { tone: "info", title: "Borrador guardado" },
};

export const DetailOnly: Story = {
  args: { tone: "info", detail: "Todavía no hay nada para sincronizar." },
};
