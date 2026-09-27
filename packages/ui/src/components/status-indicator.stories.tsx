import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIndicator } from "./StatusIndicator";

const meta: Meta<typeof StatusIndicator> = {
  title: "Components/StatusIndicator",
  component: StatusIndicator,
};

export default meta;

type Story = StoryObj<typeof StatusIndicator>;

export const Success: Story = {
  args: { tone: "success", children: "Conectado" },
};

export const Warning: Story = {
  args: { tone: "warning", children: "Sincronización pendiente" },
};

export const Error: Story = {
  args: { tone: "error", children: "Sin conexión" },
};

export const Info: Story = {
  args: { tone: "info", children: "En revisión" },
};

export const Neutral: Story = {
  args: { tone: "neutral", children: "Sin turno abierto" },
};

export const Busy: Story = {
  args: { tone: "info", busy: true, children: "Sincronizando" },
};
