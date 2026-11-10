import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusPill } from "./status-pill";

const meta: Meta<typeof StatusPill> = {
  title: "Components/StatusPill",
  component: StatusPill,
  args: {
    tone: "warning",
    children: "Contingencia CAEA",
  },
};

export default meta;

type Story = StoryObj<typeof StatusPill>;

export const Warning: Story = {};

export const ErrorTone: Story = {
  args: { tone: "error", children: "Sin conexión con la nube" },
};

export const Neutral: Story = {
  args: { tone: "neutral", children: "Sin sesión abierta" },
};

export const InHeader: Story = {
  decorators: [
    () => (
      <div className="flex gap-2">
        <StatusPill tone="error">Sin conexión con la nube</StatusPill>
        <StatusPill tone="warning">Contingencia CAEA</StatusPill>
        <StatusPill tone="warning">Balanza sin conectar</StatusPill>
        <StatusPill tone="warning">4 avisos</StatusPill>
      </div>
    ),
  ],
};
