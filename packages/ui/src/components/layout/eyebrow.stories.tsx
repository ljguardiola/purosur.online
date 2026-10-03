import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eyebrow } from "./eyebrow";

const meta: Meta<typeof Eyebrow> = {
  title: "Components/Eyebrow",
  component: Eyebrow,
};

export default meta;

type Story = StoryObj<typeof Eyebrow>;

export const Default: Story = {
  args: { text: "Caja 1 · Sesión abierta 09:02" },
};

export const InfoTone: Story = {
  args: { text: "Cobro en efectivo", tone: "info" },
};

export const SuccessTone: Story = {
  args: { text: "Venta completada", tone: "success" },
};

export const WarningTone: Story = {
  args: { text: "Stock bajo", tone: "warning" },
};

export const ErrorTone: Story = {
  args: { text: "No se puede deshacer", tone: "error" },
};

export const Heading: Story = {
  args: { text: "Antes de empezar", headingLevel: 2 },
};

export const LongText: Story = {
  args: {
    text: "Un texto largo que no entra en una sola línea dentro de este espacio angosto",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "160px" }}>
        <Story />
      </div>
    ),
  ],
};
